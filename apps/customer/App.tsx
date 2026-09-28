import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { customerApi, dismissRating, isRatingDismissed, loadSession, login, logout, subscribeSession } from './src/api';
import { connectSocket, disconnectSocket } from './src/socket';
import { fetchBranding, Branding } from './src/brand';
import { MapSection, MAP_AVAILABLE } from './src/MapSection';
import {
  Address,
  BlockedDriver,
  CustomerProfile,
  CustomerSession,
  FarePreview,
  FavoriteDriver,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
  Ride,
  RideHistoryEntry,
  RideMessage,
  RideStatus,
  SavedCard,
  SupportMessage,
  Wallet,
} from './src/types';
import { colors, font, radius, shadow, spacing } from './src/theme';

const STATUS_LABEL: Record<RideStatus, string> = {
  REQUESTED: 'Procurando motorista',
  SEARCHING_DRIVER: 'Procurando motorista',
  DRIVER_ASSIGNED: 'Aguardando o motorista aceitar',
  DRIVER_EN_ROUTE: 'Motorista a caminho',
  PASSENGER_ABOARD: 'Em viagem',
  IN_PROGRESS: 'Em viagem',
  COMPLETED: 'Corrida finalizada',
  CANCELLED: 'Corrida cancelada',
};

// Nem todo motorista recebe qualquer forma de pagamento — avisa antes de pedir, pra não ser surpresa.
const PAYMENT_LIMIT_HINT: Partial<Record<PaymentMethod, string>> = {
  PIX: 'Só motoristas com chave Pix cadastrada recebem esta corrida.',
  CREDIT_CARD: 'Só motoristas com máquina de cartão recebem esta corrida.',
  DEBIT_CARD: 'Só motoristas com máquina de cartão recebem esta corrida.',
};

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'WALLET'];

// Só depois do motorista aceitar (DRIVER_EN_ROUTE) faz sentido "chegando em X min" —
// em DRIVER_ASSIGNED a corrida só foi oferecida e ele ainda pode recusar.
const PICKUP_STATUSES: RideStatus[] = ['DRIVER_EN_ROUTE'];
// ponytail: sem rota real (sem Directions API) — distância em linha reta ÷
// velocidade média urbana assumida. Aproximado de propósito, por isso o "~".
const AVERAGE_SPEED_KMH = 25;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const CANCEL_REASONS = ['Mudei de ideia', 'Motorista demorou muito', 'Endereço errado', 'Encontrei outra forma', 'Outro motivo'];

function estimateDriverEtaMinutes(ride: Ride): number | null {
  if (!PICKUP_STATUSES.includes(ride.status) || !ride.driver?.lastLat || !ride.driver?.lastLng) return null;
  const distanceKm = haversineKm(
    { lat: Number(ride.driver.lastLat), lng: Number(ride.driver.lastLng) },
    { lat: Number(ride.originLat), lng: Number(ride.originLng) },
  );
  return Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
}

// Quatro horários fixos em vez de um seletor de data/hora completo — cobre o
// caso de uso (agendar mais tarde) sem puxar uma lib nativa de date picker.
function minutesUntilTomorrowMorning(): number {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(8, 0, 0, 0);
  return Math.round((target.getTime() - Date.now()) / 60000);
}

// "Amanhã de manhã" era fixo em 20 h a partir de agora — à noite virava fim de tarde do dia seguinte.
const SCHEDULE_PRESETS: { label: string; minutesFromNow: () => number }[] = [
  { label: 'Em 30 min', minutesFromNow: () => 30 },
  { label: 'Em 1 hora', minutesFromNow: () => 60 },
  { label: 'Em 2 horas', minutesFromNow: () => 120 },
  { label: 'Amanhã às 8h', minutesFromNow: minutesUntilTomorrowMorning },
];
const TAB_BAR_HEIGHT = 60;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [brand, setBrand] = useState<Branding>({ nomeEmpresa: 'Central de Controle', corPrimaria: '#0D857A', logoUrl: '' });

  // Sessão que morre no meio do uso (refresh recusado) leva de volta ao login sozinha.
  useEffect(() => {
    subscribeSession(setSession);
  }, []);

  useEffect(() => {
    (async () => {
      const [storedSession, storedBrand] = await Promise.all([loadSession(), fetchBranding()]);
      setSession(storedSession);
      setBrand(storedBrand);
      setBooting(false);
    })();
  }, []);

  const handleLoggedIn = useCallback((next: CustomerSession) => setSession(next), []);
  const handleLoggedOut = useCallback(() => setSession(null), []);

  if (booting || !fontsLoaded) {
    return (
      <View style={[styles.center, styles.flex1]}>
        <ActivityIndicator size="large" color={brand.corPrimaria} />
      </View>
    );
  }

  return (
    <View style={styles.flex1}>
      <StatusBar barStyle="dark-content" />
      {session ? (
        <HomeScreen session={session} brand={brand} onLoggedOut={handleLoggedOut} />
      ) : (
        <LoginScreen brand={brand} onLoggedIn={handleLoggedIn} />
      )}
    </View>
  );
}

function BrandHeader({ brand }: { brand: Branding }) {
  return (
    <View style={styles.brandRow}>
      {brand.logoUrl ? (
        <Image source={{ uri: brand.logoUrl }} style={styles.brandLogo} />
      ) : (
        <View style={[styles.brandLogo, styles.brandLogoFallback, { backgroundColor: brand.corPrimaria }]}>
          <Text style={styles.brandLogoLetter}>{brand.nomeEmpresa.charAt(0)}</Text>
        </View>
      )}
      <Text style={styles.brandName}>{brand.nomeEmpresa}</Text>
    </View>
  );
}

function BrandPill({ brand }: { brand: Branding }) {
  return (
    <View style={[styles.brandPill, { backgroundColor: brand.corPrimaria }]}>
      {!!brand.logoUrl && <Image source={{ uri: brand.logoUrl }} style={styles.brandPillLogo} />}
      <Text style={styles.brandPillText} numberOfLines={1}>
        {brand.nomeEmpresa}
      </Text>
    </View>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  return (
    <View style={styles.inlineRow}>
      <Ionicons name="star" size={13} color="#F5A623" />
      <Text style={styles.rideMeta}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function LoginScreen({ brand, onLoggedIn }: { brand: Branding; onLoggedIn: (session: CustomerSession) => void }) {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    try {
      const session = await login(cpf.replace(/\D/g, ''), password);
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={[styles.flex1, styles.center, styles.screenPadding]}>
      <BrandHeader brand={brand} />
      <Text style={styles.subtitle}>Acesso do cliente</Text>

      <TextInput style={styles.input} placeholder="CPF" keyboardType="number-pad" value={cpf} onChangeText={setCpf} maxLength={11} />
      <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [styles.button, { backgroundColor: brand.corPrimaria }, pending && styles.buttonDisabled, pressed && styles.buttonPressed]}
        disabled={pending || cpf.length !== 11 || password.length < 6}
        onPress={handleSubmit}
      >
        <Text style={styles.buttonText}>{pending ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>

      <Text style={styles.hint}>Sem senha ainda? Fale com a central — ela é definida no seu cadastro.</Text>
    </View>
  );
}

type HomeView = 'home' | 'pickDestination' | 'confirmRide';
type HomeTab = 'inicio' | 'atividade' | 'conta';

function HomeScreen({ session, brand, onLoggedOut }: { session: CustomerSession; brand: Branding; onLoggedOut: () => void }) {
  const [view, setView] = useState<HomeView>('home');
  const [activeTab, setActiveTab] = useState<HomeTab>('inicio');
  const [destination, setDestination] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [loadingRide, setLoadingRide] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Erro de ação (ex.: a corrida foi cancelada no meio) some sozinho — antes ficava na
  // tela até a próxima ação e aparecia junto de uma corrida nova, sem relação nenhuma.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages, setMessages] = useState<RideMessage[]>([]);
  // O efeito que conecta o socket roda uma única vez (deps []), então o
  // callback que ele registra fecha sobre o `ride` da primeira renderização —
  // sem essa ref, todo 'ride-message.created' buscaria mensagens da corrida
  // errada (ou de nenhuma).
  const rideRef = useRef<Ride | null>(null);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

  const refreshMessages = useCallback(async () => {
    const current = rideRef.current;
    if (!current?.driver) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await customerApi.rideMessages(current.id));
    } catch {
      // próximo poll/evento de socket corrige
    }
  }, []);

  useEffect(() => {
    refreshMessages();
  }, [ride?.id, ride?.driver, refreshMessages]);

  const refreshRide = useCallback(async () => {
    try {
      const { ride: current } = await customerApi.currentRide();
      // Concluída (avaliação dispensada) ou cancelada (aviso dispensado) não fica prendendo a tela inicial.
      if ((current?.status === 'COMPLETED' || current?.status === 'CANCELLED') && (await isRatingDismissed(current.id))) {
        setRide(null);
      } else {
        setRide(current);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('expirada')) onLoggedOut();
    } finally {
      setLoadingRide(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    refreshRide();
    connectSocket(refreshRide, refreshMessages);
    const poll = setInterval(refreshRide, 10000);
    return () => {
      disconnectSocket();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const current = await Location.getCurrentPositionAsync().catch(() => null);
      if (current && !cancelled) setMyLocation({ lat: current.coords.latitude, lng: current.coords.longitude });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCancel(reason: string) {
    if (!ride) return;
    setActionPending(true);
    setError(null);
    try {
      await customerApi.cancelRide(ride.id, reason);
      await dismissRating(ride.id); // cancelou por conta própria: não precisa do aviso de "corrida cancelada"
      await refreshRide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      setActionPending(false);
    }
  }

  async function handleSendMessage(text: string) {
    if (!ride) return;
    await customerApi.sendRideMessage(ride.id, text);
    await refreshMessages();
  }

  if (view === 'pickDestination') {
    return (
      <PickDestinationScreen
        brand={brand}
        myLocation={myLocation}
        onBack={() => setView('home')}
        onSelect={(dest) => {
          setDestination(dest);
          setView('confirmRide');
        }}
      />
    );
  }

  if (view === 'confirmRide' && destination) {
    return (
      <ConfirmRideScreen
        brand={brand}
        origin={myLocation}
        destination={destination}
        onBack={() => setView('pickDestination')}
        onConfirmed={() => {
          setView('home');
          refreshRide();
        }}
      />
    );
  }

  const driverMarker = ride?.driver?.lastLat && ride?.driver?.lastLng
    ? [{ lat: Number(ride.driver.lastLat), lng: Number(ride.driver.lastLng), color: 'blue' }]
    : [];

  return (
    <View style={styles.flex1}>
      {activeTab === 'inicio' && (
        <>
          <View style={styles.mapLayer}>
            <MapSection center={myLocation} markers={driverMarker} />
          </View>

          <SafeAreaView style={[styles.topOverlayHome, { pointerEvents: 'box-none' }]}>
            <View style={styles.topOverlayContent} pointerEvents="box-none">
            <BrandPill brand={brand} />
            </View>
          </SafeAreaView>

          <SafeAreaView style={[styles.bottomSheet, { bottom: TAB_BAR_HEIGHT }]}>
            <ScrollView contentContainerStyle={styles.bottomSheetContent} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHandle} />
              {error && <Text style={styles.error}>{error}</Text>}

              {loadingRide ? (
                <ActivityIndicator style={styles.rideLoading} color={brand.corPrimaria} />
              ) : ride && ride.status === 'COMPLETED' ? (
                <RatingScreen ride={ride} brand={brand} onDone={refreshRide} />
              ) : ride && ride.status === 'CANCELLED' ? (
                <CancelledCard
                  ride={ride}
                  brand={brand}
                  onDismiss={async () => {
                    await dismissRating(ride.id);
                    await refreshRide();
                  }}
                />
              ) : ride ? (
                <RideTrackingCard
                  ride={ride}
                  brand={brand}
                  pending={actionPending}
                  onCancel={handleCancel}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                />
              ) : (
                <View>
                  <Text style={styles.driverName}>
                    {greeting()}, {session.customer.name.split(' ')[0]}
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.searchEntry, pressed && styles.buttonPressed]}
                    onPress={() => setView('pickDestination')}
                    accessibilityRole="button"
                    accessibilityLabel="Buscar destino"
                  >
                    <Feather name="search" size={18} color={brand.corPrimaria} />
                    <Text style={styles.searchEntryText}>Para onde vamos?</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </>
      )}

      {activeTab === 'atividade' && <AtividadeTab brand={brand} />}
      {activeTab === 'conta' && <ContaTab brand={brand} session={session} onLoggedOut={onLoggedOut} />}

      <BottomTabBar active={activeTab} onChange={setActiveTab} brand={brand} />
    </View>
  );
}

const TAB_ICON: Record<HomeTab, keyof typeof Feather.glyphMap> = {
  inicio: 'home',
  atividade: 'activity',
  conta: 'user',
};

function BottomTabBar({ active, onChange, brand }: { active: HomeTab; onChange: (tab: HomeTab) => void; brand: Branding }) {
  const tabs: { key: HomeTab; label: string }[] = [
    { key: 'inicio', label: 'Início' },
    { key: 'atividade', label: 'Atividade' },
    { key: 'conta', label: 'Conta' },
  ];
  return (
    <SafeAreaView style={styles.tabBar}>
      <View style={styles.tabBarRow}>
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Pressable key={tab.key} style={styles.tabBarItem} onPress={() => onChange(tab.key)}>
              <View style={styles.tabIconWrap}>
                {isActive && <View style={[StyleSheet.absoluteFill, styles.tabIconActiveBg, { backgroundColor: brand.corPrimaria }]} />}
                <Feather name={TAB_ICON[tab.key]} size={22} color={isActive ? brand.corPrimaria : colors.textTertiary} />
              </View>
              <Text style={[styles.tabBarLabel, isActive && [styles.tabBarLabelActive, { color: brand.corPrimaria }]]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function AtividadeTab({ brand }: { brand: Branding }) {
  const [items, setItems] = useState<RideHistoryEntry[] | null>(null);

  useEffect(() => {
    customerApi
      .rideHistory()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <SafeAreaView style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.tabScreenPadding}>
        <Text style={styles.driverName}>Atividade</Text>
        {items === null ? (
          <ActivityIndicator color={brand.corPrimaria} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma corrida até o momento. Peça sua primeira corrida na aba Início!</Text>
        ) : (
          items.map((item) => {
            const isPendingSchedule = item.status === 'REQUESTED' && item.scheduledAt && new Date(item.scheduledAt) > new Date();
            return (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyRowHeader}>
                <Text style={[styles.historyStatus, { color: brand.corPrimaria }]}>{isPendingSchedule ? 'Agendada' : STATUS_LABEL[item.status]}</Text>
                <Text style={styles.rideMeta}>
                  {isPendingSchedule
                    ? new Date(item.scheduledAt!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : new Date(item.requestedAt).toLocaleDateString('pt-BR')}
                </Text>
              </View>
              <Text style={styles.rideAddress}>
                {item.originAddress} → {item.destinationAddress}
              </Text>
              <View style={styles.historyRowFooter}>
                <Text style={styles.rideMeta}>{item.driver?.name ?? 'Sem motorista'}</Text>
                {item.finalPrice && <Text style={styles.rideMeta}>{formatCurrency(item.finalPrice)}</Text>}
              </View>
            </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type ContaSubView = 'main' | 'wallet' | 'cards' | 'favorites' | 'blocked' | 'addresses';

function ContaTab({ session, brand, onLoggedOut }: { session: CustomerSession; brand: Branding; onLoggedOut: () => void }) {
  const [subView, setSubView] = useState<ContaSubView>('main');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[] | null>(null);

  const refreshSupportMessages = useCallback(() => {
    customerApi
      .supportMessages()
      .then(setSupportMessages)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    customerApi
      .me()
      .then(setProfile)
      .catch(() => undefined);
    refreshSupportMessages();
  }, [refreshSupportMessages]);

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      await customerApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSendSupport() {
    setSupportSending(true);
    try {
      await customerApi.sendSupportMessage(supportMessage.trim());
      setSupportMessage('');
      setSupportSent(true);
      refreshSupportMessages();
      setTimeout(() => setSupportSent(false), 2000);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    } finally {
      setSupportSending(false);
    }
  }

  async function handleLogout() {
    disconnectSocket();
    await logout();
    onLoggedOut();
  }

  if (subView === 'wallet') return <WalletScreen brand={brand} onBack={() => setSubView('main')} />;
  if (subView === 'cards') return <CardsScreen brand={brand} onBack={() => setSubView('main')} />;
  if (subView === 'favorites') return <FavoritesScreen brand={brand} onBack={() => setSubView('main')} />;
  if (subView === 'blocked') return <BlockedDriversScreen brand={brand} onBack={() => setSubView('main')} />;
  if (subView === 'addresses') return <AddressesScreen brand={brand} onBack={() => setSubView('main')} />;

  return (
    <SafeAreaView style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.tabScreenPadding}>
        <Text style={styles.driverName}>{profile?.name ?? session.customer.name}</Text>
        {profile?.phone && <Text style={styles.rideMeta}>{profile.phone}</Text>}
        {profile?.email && <Text style={styles.rideMeta}>{profile.email}</Text>}

        <Pressable style={styles.menuRow} onPress={() => setSubView('addresses')}>
          <Text style={styles.menuRowText}>Meus endereços</Text>
          <Text style={styles.menuRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.menuRow} onPress={() => setSubView('wallet')}>
          <Text style={styles.menuRowText}>Carteira</Text>
          <Text style={styles.menuRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.menuRow} onPress={() => setSubView('cards')}>
          <Text style={styles.menuRowText}>Cartões salvos</Text>
          <Text style={styles.menuRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.menuRow} onPress={() => setSubView('favorites')}>
          <Text style={styles.menuRowText}>Motoristas favoritos</Text>
          <Text style={styles.menuRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.menuRow} onPress={() => setSubView('blocked')}>
          <Text style={styles.menuRowText}>Motoristas bloqueados</Text>
          <Text style={styles.menuRowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Alterar senha</Text>
        <TextInput style={styles.input} placeholder="Senha atual" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
        <TextInput
          style={styles.input}
          placeholder="Nova senha (mín. 6 caracteres)"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        {passwordError && <Text style={styles.error}>{passwordError}</Text>}
        <Pressable
          style={[
            styles.button,
            styles.buttonOutline,
            (currentPassword.length === 0 || newPassword.length < 6 || passwordSaving) && styles.buttonDisabled,
          ]}
          disabled={currentPassword.length === 0 || newPassword.length < 6 || passwordSaving}
          onPress={handleChangePassword}
        >
          <Text style={styles.buttonOutlineText}>{passwordSaving ? 'Salvando…' : passwordSaved ? 'Senha alterada ✓' : 'Alterar senha'}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Fale conosco</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="Escreva sua mensagem"
          value={supportMessage}
          onChangeText={setSupportMessage}
          multiline
        />
        <Pressable
          style={[styles.button, styles.buttonOutline, (supportMessage.trim().length === 0 || supportSending) && styles.buttonDisabled]}
          disabled={supportMessage.trim().length === 0 || supportSending}
          onPress={handleSendSupport}
        >
          <Text style={styles.buttonOutlineText}>{supportSending ? 'Enviando…' : supportSent ? 'Enviado ✓' : 'Enviar mensagem'}</Text>
        </Pressable>

        {supportMessages && supportMessages.length > 0 && (
          <View style={styles.supportHistory}>
            {supportMessages.map((m) => (
              <View key={m.id} style={styles.historyRow}>
                <Text style={styles.rideAddress}>{m.message}</Text>
                <Text style={styles.rideMeta}>{new Date(m.createdAt).toLocaleString('pt-BR')}</Text>
                {m.reply ? (
                  <View style={styles.supportReplyBox}>
                    <Text style={[styles.supportReplyLabel, { color: brand.corPrimaria }]}>Resposta da central</Text>
                    <Text style={styles.rideAddress}>{m.reply}</Text>
                  </View>
                ) : (
                  <Text style={styles.supportPending}>Aguardando resposta</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <Pressable style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SubScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.topBarPlain}>
      <Pressable style={styles.backLink} onPress={onBack}>
        <Feather name="arrow-left" size={16} color={colors.textSecondary} />
        <Text style={styles.logoutText}>Voltar</Text>
      </Pressable>
      <Text style={styles.driverName}>{title}</Text>
    </View>
  );
}

function WalletScreen({ brand, onBack }: { brand: Branding; onBack: () => void }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(() => {
    customerApi
      .getWallet()
      .then(setWallet)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function handleTopUp() {
    const value = Number(amount.replace(',', '.'));
    if (!value || value <= 0) return;
    setPending(true);
    try {
      const next = await customerApi.topUpWallet(value);
      setWallet(next);
      setAmount('');
    } catch {
      Alert.alert('Erro', 'Não foi possível recarregar a carteira.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.flex1, styles.screenPadding]}>
      <SubScreenHeader title="Carteira" onBack={onBack} />

      {wallet === null ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : (
        <>
          <View style={styles.fareBox}>
            <Text style={styles.rideMeta}>Saldo disponível</Text>
            <Text style={styles.ridePrice}>{wallet.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>
          </View>

          <Text style={styles.fieldLabel}>Recarregar</Text>
          <View style={styles.topUpRow}>
            <TextInput
              style={[styles.input, styles.topUpInput]}
              placeholder="Valor (R$)"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <Pressable
              style={[styles.button, styles.topUpButton, { backgroundColor: brand.corPrimaria }, (!amount || pending) && styles.buttonDisabled]}
              disabled={!amount || pending}
              onPress={handleTopUp}
            >
              <Text style={styles.buttonText}>{pending ? '…' : 'Recarregar'}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Recarga simulada — sem cobrança real em nenhum meio de pagamento.</Text>

          <Text style={styles.sectionTitle}>Histórico</Text>
          {wallet.transactions.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma movimentação ainda.</Text>
          ) : (
            wallet.transactions.map((tx) => (
              <View key={tx.id} style={styles.historyRow}>
                <View style={styles.historyRowHeader}>
                  <Text style={styles.rideAddress}>{tx.description}</Text>
                  <Text style={[styles.rideMeta, tx.type === 'TOPUP' && { color: brand.corPrimaria }]}>
                    {tx.type === 'TOPUP' ? '+' : '-'}
                    {formatCurrency(tx.amount)}
                  </Text>
                </View>
                <Text style={styles.rideMeta}>{new Date(tx.createdAt).toLocaleString('pt-BR')}</Text>
              </View>
            ))
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function CardsScreen({ brand, onBack }: { brand: Branding; onBack: () => void }) {
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [brandInput, setBrandInput] = useState('');
  const [last4, setLast4] = useState('');
  const [expiry, setExpiry] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(() => {
    customerApi
      .listCards()
      .then(setCards)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const canAdd = brandInput.trim().length >= 2 && /^\d{4}$/.test(last4) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);

  async function handleAdd() {
    setPending(true);
    try {
      await customerApi.addCard({ brand: brandInput.trim(), last4, expiry });
      setBrandInput('');
      setLast4('');
      setExpiry('');
      refresh();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível salvar o cartão.');
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(id: string) {
    await customerApi.removeCard(id);
    refresh();
  }

  return (
    <SafeAreaView style={[styles.flex1, styles.screenPadding]}>
      <SubScreenHeader title="Cartões salvos" onBack={onBack} />

      {cards === null ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : cards.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum cartão salvo ainda.</Text>
      ) : (
        cards.map((card) => (
          <View key={card.id} style={[styles.historyRow, styles.cardRow]}>
            <View>
              <Text style={styles.rideAddress}>
                {card.brand} •••• {card.last4}
              </Text>
              <Text style={styles.rideMeta}>Validade {card.expiry}</Text>
            </View>
            <Pressable onPress={() => handleRemove(card.id)}>
              <Text style={styles.removeLink}>Remover</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Adicionar cartão</Text>
      <Text style={styles.hint}>
        Guardamos só a bandeira e os 4 últimos dígitos, como um rótulo — nunca o número completo ou o código de segurança.
      </Text>
      <TextInput style={styles.input} placeholder="Bandeira (ex.: Visa)" value={brandInput} onChangeText={setBrandInput} />
      <TextInput style={styles.input} placeholder="Últimos 4 dígitos" keyboardType="number-pad" maxLength={4} value={last4} onChangeText={setLast4} />
      <TextInput style={styles.input} placeholder="Validade (MM/AA)" maxLength={5} value={expiry} onChangeText={setExpiry} />
      <Pressable
        style={[styles.button, { backgroundColor: brand.corPrimaria }, (!canAdd || pending) && styles.buttonDisabled]}
        disabled={!canAdd || pending}
        onPress={handleAdd}
      >
        <Text style={styles.buttonText}>{pending ? 'Salvando…' : 'Salvar cartão'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function FavoritesScreen({ brand, onBack }: { brand: Branding; onBack: () => void }) {
  const [favorites, setFavorites] = useState<FavoriteDriver[] | null>(null);

  const refresh = useCallback(() => {
    customerApi
      .listFavoriteDrivers()
      .then(setFavorites)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function handleRemove(driverId: string) {
    await customerApi.removeFavoriteDriver(driverId);
    refresh();
  }

  return (
    <SafeAreaView style={[styles.flex1, styles.screenPadding]}>
      <SubScreenHeader title="Motoristas favoritos" onBack={onBack} />

      {favorites === null ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : favorites.length === 0 ? (
        <Text style={styles.emptyText}>
          Você ainda não tem motoristas favoritos. Depois de uma corrida, avalie o motorista e marque como favorito.
        </Text>
      ) : (
        favorites.map((fav) => (
          <View key={fav.id} style={[styles.historyRow, styles.cardRow]}>
            <View>
              <Text style={styles.rideAddress}>{fav.driver.name}</Text>
              {fav.driver.vehicles[0] && (
                <Text style={styles.rideMeta}>
                  {fav.driver.vehicles[0].brand} {fav.driver.vehicles[0].model} · {fav.driver.vehicles[0].plate}
                </Text>
              )}
              {fav.driver.rating && <RatingBadge rating={Number(fav.driver.rating)} />}
            </View>
            <Pressable onPress={() => handleRemove(fav.driverId)}>
              <Text style={styles.removeLink}>Remover</Text>
            </Pressable>
          </View>
        ))
      )}
    </SafeAreaView>
  );
}

function BlockedDriversScreen({ brand, onBack }: { brand: Branding; onBack: () => void }) {
  const [blocked, setBlocked] = useState<BlockedDriver[] | null>(null);

  const refresh = useCallback(() => {
    customerApi
      .listBlockedDrivers()
      .then(setBlocked)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function handleUnblock(driverId: string) {
    await customerApi.unblockDriver(driverId);
    refresh();
  }

  return (
    <SafeAreaView style={[styles.flex1, styles.screenPadding]}>
      <SubScreenHeader title="Motoristas bloqueados" onBack={onBack} />

      {blocked === null ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : blocked.length === 0 ? (
        <Text style={styles.emptyText}>
          Você não bloqueou nenhum motorista. Depois de uma corrida, avalie o motorista e marque para bloquear.
        </Text>
      ) : (
        blocked.map((b) => (
          <View key={b.id} style={[styles.historyRow, styles.cardRow]}>
            <View>
              <Text style={styles.rideAddress}>{b.driver.name}</Text>
              {b.driver.vehicles[0] && (
                <Text style={styles.rideMeta}>
                  {b.driver.vehicles[0].brand} {b.driver.vehicles[0].model} · {b.driver.vehicles[0].plate}
                </Text>
              )}
            </View>
            <Pressable onPress={() => handleUnblock(b.driverId)}>
              <Text style={styles.removeLink}>Desbloquear</Text>
            </Pressable>
          </View>
        ))
      )}
    </SafeAreaView>
  );
}

type AddressPicker = { mode: 'add' } | { mode: 'edit'; id: string; center: { lat: number; lng: number }; description: string };

function AddressesScreen({ brand, onBack }: { brand: Branding; onBack: () => void }) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [picker, setPicker] = useState<AddressPicker | null>(null);

  const refresh = useCallback(() => {
    customerApi
      .listAddresses()
      .then(setAddresses)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function handleRemove(id: string) {
    await customerApi.removeAddress(id);
    refresh();
  }

  if (picker?.mode === 'add') {
    return (
      <LocationPickerScreen
        brand={brand}
        initialCenter={null}
        onBack={() => setPicker(null)}
        onConfirm={async (result) => {
          await customerApi.addAddress({ label: newLabel.trim() || undefined, ...result });
          setNewLabel('');
          setPicker(null);
          refresh();
        }}
      />
    );
  }

  if (picker?.mode === 'edit') {
    return (
      <LocationPickerScreen
        brand={brand}
        initialCenter={picker.center}
        initialDescription={picker.description}
        onBack={() => setPicker(null)}
        onConfirm={async (result) => {
          await customerApi.updateAddress(picker.id, result);
          setPicker(null);
          refresh();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.flex1, styles.screenPadding]}>
      <SubScreenHeader title="Meus endereços" onBack={onBack} />

      {addresses === null ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : addresses.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum endereço salvo ainda.</Text>
      ) : (
        addresses.map((addr) => (
          <View key={addr.id} style={[styles.historyRow, styles.cardRow]}>
            <View>
              {addr.label && <Text style={styles.addressLabel}>{addr.label}</Text>}
              <Text style={styles.rideAddress}>{addr.address}</Text>
            </View>
            <View style={styles.addressActions}>
              <Pressable
                onPress={() =>
                  setPicker({ mode: 'edit', id: addr.id, center: { lat: Number(addr.lat), lng: Number(addr.lng) }, description: addr.address })
                }
              >
                <Text style={styles.editLink}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => handleRemove(addr.id)}>
                <Text style={styles.removeLink}>Remover</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Adicionar endereço</Text>
      <TextInput style={styles.input} placeholder="Nome (ex.: Casa, Trabalho)" value={newLabel} onChangeText={setNewLabel} />
      <Pressable style={[styles.button, { backgroundColor: brand.corPrimaria }]} onPress={() => setPicker({ mode: 'add' })}>
        <Text style={styles.buttonText}>Marcar local</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ponytail: sem "digitando…", sem anexos/mídia — só texto puro, um poll leve
// (ver refreshMessages em HomeScreen) acelerado pelo socket quando chega
// mensagem nova. Suficiente para o caso de uso (avisar o outro lado de algo
// pontual durante a corrida), upgrade pra push/typing indicator se um dia
// isso virar um chat de verdade fora do contexto da corrida.
function ChatSection({
  brand,
  messages,
  mine,
  onSend,
}: {
  brand: Branding;
  messages: RideMessage[];
  mine: 'customer' | 'driver';
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.chatBox}>
      <Text style={styles.fieldLabel}>Mensagens</Text>
      {messages.length === 0 ? (
        <Text style={styles.chatEmpty}>Nenhuma mensagem ainda.</Text>
      ) : (
        <View style={styles.chatMessages}>
          {messages.map((m) => (
            <View
              key={m.id}
              style={[styles.chatBubble, m.senderType === mine ? [styles.chatBubbleMine, { backgroundColor: brand.corPrimaria }] : styles.chatBubbleTheirs]}
            >
              <Text style={m.senderType === mine ? styles.chatBubbleTextMine : styles.chatBubbleTextTheirs}>{m.message}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.chatInputRow}>
        <TextInput style={[styles.input, styles.chatInput]} placeholder="Escreva uma mensagem" value={text} onChangeText={setText} onSubmitEditing={handleSend} />
        <Pressable
          style={({ pressed }) => [
            styles.chatSendCircle,
            { backgroundColor: brand.corPrimaria },
            (!text.trim() || sending) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          disabled={!text.trim() || sending}
          onPress={handleSend}
        >
          <Feather name="send" size={18} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

function RideTrackingCard({
  ride,
  brand,
  pending,
  onCancel,
  messages,
  onSendMessage,
}: {
  ride: Ride;
  brand: Branding;
  pending: boolean;
  onCancel: (reason: string) => void;
  messages: RideMessage[];
  onSendMessage: (text: string) => Promise<void>;
}) {
  const eta = estimateDriverEtaMinutes(ride);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');

  const isOther = cancelReason === 'Outro motivo';
  const finalReason = (isOther ? customReason.trim() : cancelReason) ?? '';

  return (
    <View>
      <Text style={[styles.rideStatus, { color: brand.corPrimaria }]}>{STATUS_LABEL[ride.status]}</Text>
      <Text style={styles.rideAddress}>Para: {ride.destinationAddress}</Text>
      {ride.finalPrice && <Text style={styles.ridePrice}>{formatCurrency(ride.finalPrice)}</Text>}
      {/* Como pagar só depois que o motorista aceita (antes é só uma oferta que ele ainda pode recusar) */}
      {ride.driver && ride.status !== 'DRIVER_ASSIGNED' && ride.paymentMethod && <PaymentInfo ride={ride} brand={brand} />}

      {ride.driver ? (
        <View style={styles.driverCard}>
          <Text style={styles.driverCardName}>{ride.driver.name}</Text>
          {eta != null && <Text style={[styles.etaText, { color: brand.corPrimaria }]}>Chegando em ~{eta} min</Text>}
          {ride.driver.vehicles[0] && (
            <Text style={styles.rideMeta}>
              {ride.driver.vehicles[0].brand} {ride.driver.vehicles[0].model} · {ride.driver.vehicles[0].plate}
            </Text>
          )}
          {ride.driver.rating && <RatingBadge rating={Number(ride.driver.rating)} />}
          {/* O telefone só vem depois que o motorista aceita (antes é só uma oferta) */}
          {!!ride.driver.phone && (
            <Pressable
              style={({ pressed }) => [styles.button, styles.buttonOutline, styles.callButton, pressed && styles.buttonPressed]}
              onPress={() => Linking.openURL(`tel:${ride.driver!.phone!.replace(/\D/g, '')}`)}
            >
              <View style={styles.buttonContent}>
                <Feather name="phone" size={16} color={colors.textPrimary} />
                <Text style={styles.buttonOutlineText}>Ligar para o motorista</Text>
              </View>
            </Pressable>
          )}
          <ChatSection brand={brand} messages={messages} mine="customer" onSend={onSendMessage} />
        </View>
      ) : (
        <Text style={styles.emptyText}>Buscando o motorista mais próximo…</Text>
      )}

      {ride.status === 'IN_PROGRESS' ? null : cancelOpen ? (
        <View style={styles.cancelBox}>
          <Text style={styles.fieldLabel}>Por que está cancelando?</Text>
          <View style={styles.scheduleRow}>
            {CANCEL_REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={[styles.scheduleChip, cancelReason === reason && { borderColor: brand.corPrimaria }]}
                onPress={() => setCancelReason(reason)}
              >
                <Text style={[styles.scheduleChipText, cancelReason === reason && { color: brand.corPrimaria }]}>{reason}</Text>
              </Pressable>
            ))}
          </View>
          {isOther && (
            <TextInput
              style={styles.input}
              placeholder="Descreva o motivo"
              value={customReason}
              onChangeText={setCustomReason}
            />
          )}
          <Pressable
            style={[styles.button, styles.buttonOutline, (!finalReason || pending) && styles.buttonDisabled]}
            disabled={!finalReason || pending}
            onPress={() => onCancel(finalReason)}
          >
            <Text style={styles.buttonOutlineText}>{pending ? 'Cancelando…' : 'Confirmar cancelamento'}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[styles.button, styles.buttonOutline]} onPress={() => setCancelOpen(true)}>
          <Text style={styles.buttonOutlineText}>Cancelar corrida</Text>
        </Pressable>
      )}
    </View>
  );
}

// Pagamento é direto ao motorista, fora do app: diz como pagar e, no Pix, mostra a chave com botão de copiar.
function PaymentInfo({ ride, brand }: { ride: Ride; brand: Branding }) {
  const [copied, setCopied] = useState(false);
  const method = ride.paymentMethod!;
  const pixKey = ride.driver?.pixKey;

  async function copy() {
    if (!pixKey) return;
    await Clipboard.setStringAsync(pixKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.paymentInfoBox}>
      <Text style={styles.paymentInfoTitle}>
        {method === 'CASH' && 'Pague em dinheiro ao motorista'}
        {method === 'PIX' && 'Pague via Pix ao motorista'}
        {(method === 'CREDIT_CARD' || method === 'DEBIT_CARD') && 'Pague no cartão, na máquina do motorista'}
        {method === 'WALLET' && 'Pago pela sua carteira'}
      </Text>
      <Text style={styles.rideMeta}>
        {method === 'CASH' && 'No fim da corrida.'}
        {method === 'PIX' && (pixKey ? 'No fim da corrida, para esta chave:' : 'O motorista informa a chave no fim da corrida.')}
        {(method === 'CREDIT_CARD' || method === 'DEBIT_CARD') && 'No fim da corrida.'}
        {method === 'WALLET' && 'O valor sai do seu saldo quando a corrida terminar.'}
      </Text>
      {method === 'PIX' && !!pixKey && (
        <View style={styles.pixRow}>
          <Text style={styles.pixKeyText} selectable>
            {pixKey}
          </Text>
          <Pressable style={[styles.pixCopyButton, { borderColor: brand.corPrimaria }]} onPress={copy}>
            <Text style={[styles.pixCopyText, { color: brand.corPrimaria }]}>{copied ? 'Copiado ✓' : 'Copiar'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Corrida encerrada sem o cliente pedir (o despacho cancela sozinho quando ninguém aceita, ou a central
// cancelou): explica o motivo e deixa pedir de novo — antes o cartão da corrida simplesmente sumia.
function CancelledCard({ ride, brand, onDismiss }: { ride: Ride; brand: Branding; onDismiss: () => void }) {
  return (
    <View>
      <Text style={[styles.rideStatus, { color: brand.corPrimaria }]}>{STATUS_LABEL.CANCELLED}</Text>
      <Text style={styles.rideAddress}>Para: {ride.destinationAddress}</Text>
      {!!ride.cancelReason && <Text style={styles.emptyText}>{ride.cancelReason}</Text>}
      <Pressable style={[styles.button, { backgroundColor: brand.corPrimaria }]} onPress={onDismiss}>
        <Text style={styles.buttonText}>Ok</Text>
      </Pressable>
    </View>
  );
}

function RatingScreen({ ride, brand, onDone }: { ride: Ride; brand: Branding; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [blockDriver, setBlockDriver] = useState(false);
  const [sending, setSending] = useState(false);

  // Nota baixa (1-2★) oferece bloquear, nota alta (4-5★) oferece favoritar —
  // nunca os dois juntos, não faz sentido favoritar e bloquear o mesmo
  // motorista na mesma avaliação. 3★ não oferece nenhum dos dois (neutro).
  function selectStars(n: number) {
    setStars(n);
    setFavorite(false);
    setBlockDriver(false);
  }

  async function handleConfirm() {
    if (stars === 0) return;
    setSending(true);
    try {
      await customerApi.rateDriver(ride.id, stars);
      if (favorite && ride.driver) await customerApi.addFavoriteDriver(ride.driver.id).catch(() => undefined);
      if (blockDriver && ride.driver) await customerApi.blockDriver(ride.driver.id).catch(() => undefined);
    } catch {
      // corrida pode já ter sido avaliada, ou a rede falhou — não vale travar o cliente por isso
    } finally {
      setSending(false);
      onDone();
    }
  }

  return (
    <View>
      <Text style={[styles.rideStatus, { color: brand.corPrimaria }]}>Corrida finalizada</Text>
      <Text style={styles.driverName}>Avalie {ride.driver?.name ?? 'o motorista'}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => selectStars(n)}>
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={n <= stars ? brand.corPrimaria : colors.textTertiary} />
          </Pressable>
        ))}
      </View>
      {ride.driver && stars > 0 && stars <= 2 && (
        <Pressable style={styles.favoriteToggleRow} onPress={() => setBlockDriver((v) => !v)}>
          <View style={[styles.checkbox, blockDriver && { backgroundColor: brand.corPrimaria, borderColor: brand.corPrimaria }]}>
            {blockDriver && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.rideAddress}>Não quero mais corridas com {ride.driver.name}</Text>
        </Pressable>
      )}
      {ride.driver && stars >= 4 && (
        <Pressable style={styles.favoriteToggleRow} onPress={() => setFavorite((v) => !v)}>
          <View style={[styles.checkbox, favorite && { backgroundColor: brand.corPrimaria, borderColor: brand.corPrimaria }]}>
            {favorite && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.rideAddress}>Marcar {ride.driver.name} como motorista favorito</Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.button, { backgroundColor: brand.corPrimaria }, stars === 0 && styles.buttonDisabled]}
        disabled={stars === 0 || sending}
        onPress={handleConfirm}
      >
        <Text style={styles.buttonText}>{sending ? 'Enviando…' : 'Confirmar'}</Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          await dismissRating(ride.id);
          onDone();
        }}
        disabled={sending}
      >
        <Text style={styles.noteToggle}>Agora não</Text>
      </Pressable>
    </View>
  );
}

// Tela de escolha de ponto compartilhada por três fluxos (destino, origem,
// endereço salvo): busca por texto (geocodeAsync — geocoder nativo do
// aparelho, sem Google Places) ou arrasta o pino no mapa; os dois caminhos
// terminam no mesmo campo de descrição editável, que é o que de fato vai pro
// pedido de corrida — corrige tanto uma busca imprecisa quanto um pino
// arrastado pro número errado.
function LocationPickerScreen({
  brand,
  initialCenter,
  initialDescription = '',
  onBack,
  onConfirm,
}: {
  brand: Branding;
  initialCenter: { lat: number; lng: number } | null;
  initialDescription?: string;
  onBack: () => void;
  onConfirm: (result: { address: string; lat: number; lng: number }) => void;
}) {
  const [center, setCenter] = useState(initialCenter);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [description, setDescription] = useState(initialDescription);
  const [resolving, setResolving] = useState(false);

  async function handleSearch() {
    const typed = query.trim();
    if (!typed) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await Location.geocodeAsync(typed);
      if (results.length === 0) {
        setSearchError('Endereço não encontrado — tente digitar de outro jeito ou arraste o mapa.');
        return;
      }
      const point = { lat: results[0].latitude, lng: results[0].longitude };
      setCenter(point);
      const resolved = await reverseGeocodeAddress(point);
      setDescription(resolved ?? typed);
    } catch {
      setSearchError('Não foi possível buscar esse endereço agora.');
    } finally {
      setSearching(false);
    }
  }

  // Ao arrastar o pino manualmente, busca o endereço de verdade pra
  // preencher a descrição sozinho — o cliente ainda pode corrigir depois.
  async function handleRegionChange(point: { lat: number; lng: number }) {
    setCenter(point);
    setResolving(true);
    const resolved = await reverseGeocodeAddress(point);
    setResolving(false);
    if (resolved) setDescription(resolved);
  }

  function handleConfirm() {
    if (!center) return;
    onConfirm({ address: description.trim() || 'Local marcado no mapa', lat: center.lat, lng: center.lng });
  }

  return (
    <View style={styles.flex1}>
      <View style={styles.mapLayer}>
        <MapSection center={center} centerPin onRegionChangeComplete={handleRegionChange} />
      </View>
      <SafeAreaView style={styles.topOverlay}>
        <View style={styles.topBarFloating}>
          <Pressable style={styles.backLink} onPress={onBack}>
            <Feather name="arrow-left" size={16} color={colors.textSecondary} />
            <Text style={styles.logoutText}>Voltar</Text>
          </Pressable>
        </View>
        <View style={[styles.topBarFloating, styles.searchBarFloating]}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar endereço (ex.: Rua Augusta, 123)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable
            style={[styles.button, styles.topUpButton, { backgroundColor: brand.corPrimaria }, (!query.trim() || searching) && styles.buttonDisabled]}
            disabled={!query.trim() || searching}
            onPress={handleSearch}
          >
            <Text style={styles.buttonText}>{searching ? '…' : 'Buscar'}</Text>
          </Pressable>
        </View>
        {searchError && <Text style={[styles.error, styles.searchErrorFloating]}>{searchError}</Text>}
      </SafeAreaView>
      <SafeAreaView style={styles.bottomSheet}>
        <View style={styles.bottomSheetContent}>
          <View style={styles.sheetHandle} />
          <Text style={styles.driverName}>Arraste o mapa ou busque um endereço</Text>
          <TextInput
            style={styles.input}
            placeholder="Descrição do local (rua, número...)"
            value={description}
            onChangeText={setDescription}
          />
          <Pressable
            style={[styles.button, { backgroundColor: brand.corPrimaria }, (!center || resolving) && styles.buttonDisabled]}
            disabled={!center || resolving}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{resolving ? 'Buscando endereço…' : 'Usar este local'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PickDestinationScreen({
  brand,
  myLocation,
  onBack,
  onSelect,
}: {
  brand: Branding;
  myLocation: { lat: number; lng: number } | null;
  onBack: () => void;
  onSelect: (dest: { address: string; lat: number; lng: number }) => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingOnMap, setPickingOnMap] = useState(false);

  useEffect(() => {
    customerApi
      .listAddresses()
      .then(setAddresses)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (pickingOnMap) {
    return <LocationPickerScreen brand={brand} initialCenter={myLocation} onBack={() => setPickingOnMap(false)} onConfirm={onSelect} />;
  }

  return (
    <View style={[styles.flex1, styles.screenPadding]}>
      <View style={styles.topBarPlain}>
        <Pressable style={styles.backLink} onPress={onBack}>
          <Feather name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={styles.logoutText}>Voltar</Text>
        </Pressable>
      </View>
      <Text style={styles.driverName}>Escolha o destino</Text>

      {loading ? (
        <ActivityIndicator color={brand.corPrimaria} />
      ) : addresses.length === 0 ? (
        <Text style={styles.emptyText}>Você ainda não tem endereços salvos.</Text>
      ) : (
        <ScrollView style={styles.addressList}>
          {addresses.map((addr) => (
            <Pressable
              key={addr.id}
              style={styles.addressRow}
              onPress={() => onSelect({ address: addr.address, lat: Number(addr.lat), lng: Number(addr.lng) })}
            >
              {addr.label && <Text style={styles.addressLabel}>{addr.label}</Text>}
              <Text style={styles.rideAddress}>{addr.address}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Pressable
        style={[styles.button, styles.buttonOutline, !MAP_AVAILABLE && styles.buttonDisabled]}
        disabled={!MAP_AVAILABLE}
        onPress={() => setPickingOnMap(true)}
      >
        <Text style={styles.buttonOutlineText}>{MAP_AVAILABLE ? 'Marcar no mapa' : 'Marcar no mapa (só no app iOS/Android)'}</Text>
      </Pressable>
    </View>
  );
}

function ConfirmRideScreen({
  brand,
  origin: initialOrigin,
  destination,
  onBack,
  onConfirmed,
}: {
  brand: Branding;
  origin: { lat: number; lng: number } | null;
  destination: { address: string; lat: number; lng: number };
  onBack: () => void;
  onConfirmed: () => void;
}) {
  const [originAddress, setOriginAddress] = useState('Minha localização atual');
  const [originPoint, setOriginPoint] = useState(initialOrigin);
  const [pickingOriginOnMap, setPickingOriginOnMap] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState(destination.address);
  const [destinationPoint, setDestinationPoint] = useState({ lat: destination.lat, lng: destination.lng });
  const [pickingDestinationOnMap, setPickingDestinationOnMap] = useState(false);
  const [fare, setFare] = useState<FarePreview | null>(null);
  const [loadingFare, setLoadingFare] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  // Cupom já aplicado: reaplicado a cada nova prévia (mudar origem/destino não pode descartá-lo em silêncio).
  const appliedCouponRef = useRef<string | undefined>(undefined);
  // Guarda o rótulo do preset (não os minutos): "amanhã às 8h" só vira minutos na hora de enviar.
  const [schedulePreset, setSchedulePreset] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GPS pode resolver depois que essa tela já montou (primeira corrida do
  // app, permissão ainda sendo concedida) — atualiza o ponto só enquanto o
  // cliente não tiver mexido nele arrastando o mapa.
  useEffect(() => {
    if (initialOrigin && !originPoint) setOriginPoint(initialOrigin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrigin]);

  useEffect(() => {
    if (!originPoint) return;
    setLoadingFare(true);
    customerApi
      .previewFare(originPoint.lat, originPoint.lng, destinationPoint.lat, destinationPoint.lng, appliedCouponRef.current)
      .then((next) => {
        if (appliedCouponRef.current && !next?.couponCode) appliedCouponRef.current = undefined; // cupom deixou de valer nesse trajeto
        setFare(next);
      })
      .catch(() => setFare(null))
      .finally(() => setLoadingFare(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originPoint, destinationPoint]);

  async function handleApplyCoupon() {
    if (!originPoint || !couponCode.trim()) return;
    setApplyingCoupon(true);
    setCouponError(null);
    try {
      const next = await customerApi.previewFare(
        originPoint.lat,
        originPoint.lng,
        destinationPoint.lat,
        destinationPoint.lng,
        couponCode.trim(),
      );
      setFare(next);
      appliedCouponRef.current = next?.couponCode ?? undefined;
      if (!next?.couponCode) setCouponError('Cupom inválido ou expirado');
    } catch {
      setCouponError('Cupom inválido ou expirado');
    } finally {
      setApplyingCoupon(false);
    }
  }

  const scheduledPreset = SCHEDULE_PRESETS.find((p) => p.label === schedulePreset);

  async function handleConfirm() {
    if (!originPoint) return;
    // Cupom digitado e não aplicado era ignorado em silêncio: o cliente achava que tinha desconto.
    if (couponCode.trim() && couponCode.trim().toUpperCase() !== (fare?.couponCode ?? '').toUpperCase()) {
      setCouponError('Toque em Aplicar para usar o cupom (ou apague o código).');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await customerApi.requestRide({
        originAddress: originAddress.trim() || 'Minha localização atual',
        originLat: originPoint.lat,
        originLng: originPoint.lng,
        destinationAddress: destinationAddress.trim() || destination.address,
        destinationLat: destinationPoint.lat,
        destinationLng: destinationPoint.lng,
        paymentMethod,
        couponCode: fare?.couponCode || undefined,
        scheduledAt: scheduledPreset ? new Date(Date.now() + scheduledPreset.minutesFromNow() * 60000).toISOString() : undefined,
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pedir a corrida.');
    } finally {
      setSending(false);
    }
  }

  if (pickingOriginOnMap) {
    return (
      <LocationPickerScreen
        brand={brand}
        initialCenter={originPoint}
        onBack={() => setPickingOriginOnMap(false)}
        onConfirm={(result) => {
          setOriginPoint({ lat: result.lat, lng: result.lng });
          setOriginAddress(result.address);
          setPickingOriginOnMap(false);
        }}
      />
    );
  }

  if (pickingDestinationOnMap) {
    return (
      <LocationPickerScreen
        brand={brand}
        initialCenter={destinationPoint}
        onBack={() => setPickingDestinationOnMap(false)}
        onConfirm={(result) => {
          setDestinationPoint({ lat: result.lat, lng: result.lng });
          setDestinationAddress(result.address);
          setPickingDestinationOnMap(false);
        }}
      />
    );
  }

  return (
    <ScrollView style={[styles.flex1]} contentContainerStyle={styles.screenPadding}>
      <View style={styles.topBarPlain}>
        <Pressable style={styles.backLink} onPress={onBack}>
          <Feather name="arrow-left" size={16} color={colors.textSecondary} />
          <Text style={styles.logoutText}>Voltar</Text>
        </Pressable>
      </View>
      <Text style={styles.driverName}>Confirmar corrida</Text>

      <Text style={styles.fieldLabel}>Origem</Text>
      <View style={styles.topUpRow}>
        <TextInput
          style={[styles.input, styles.topUpInput]}
          value={originAddress}
          onChangeText={setOriginAddress}
          placeholder="Minha localização atual"
        />
        <Pressable
          style={[styles.button, styles.buttonOutline, styles.topUpButton, !MAP_AVAILABLE && styles.buttonDisabled]}
          disabled={!MAP_AVAILABLE}
          onPress={() => setPickingOriginOnMap(true)}
        >
          <Text style={styles.buttonOutlineText}>Ajustar</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Destino</Text>
      <View style={styles.topUpRow}>
        <TextInput style={[styles.input, styles.topUpInput]} value={destinationAddress} onChangeText={setDestinationAddress} />
        <Pressable
          style={[styles.button, styles.buttonOutline, styles.topUpButton, !MAP_AVAILABLE && styles.buttonDisabled]}
          disabled={!MAP_AVAILABLE}
          onPress={() => setPickingDestinationOnMap(true)}
        >
          <Text style={styles.buttonOutlineText}>Ajustar</Text>
        </Pressable>
      </View>

      <View style={styles.fareBox}>
        {loadingFare ? (
          <ActivityIndicator color={brand.corPrimaria} />
        ) : fare ? (
          <>
            <Text style={styles.ridePrice}>{fare.finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text>
            {fare.couponCode && fare.discount ? (
              <Text style={[styles.couponAppliedText, { color: brand.corPrimaria }]}>Cupom {fare.couponCode} aplicado · -{formatCurrency(String(fare.discount))}</Text>
            ) : null}
            <Text style={styles.rideMeta}>
              {fare.distanceKm} km · {Math.round(fare.durationMin)} min
            </Text>
          </>
        ) : (
          <Text style={styles.emptyText}>Sem tarifa configurada — o valor será calculado ao aceitar a corrida.</Text>
        )}
      </View>

      <Text style={styles.fieldLabel}>Cupom de desconto</Text>
      <View style={styles.topUpRow}>
        <TextInput
          style={[styles.input, styles.topUpInput]}
          placeholder="Código do cupom"
          autoCapitalize="characters"
          value={couponCode}
          onChangeText={(v) => {
            setCouponCode(v);
            setCouponError(null);
          }}
        />
        <Pressable
          style={[styles.button, styles.buttonOutline, styles.topUpButton, (!couponCode.trim() || applyingCoupon) && styles.buttonDisabled]}
          disabled={!couponCode.trim() || applyingCoupon}
          onPress={handleApplyCoupon}
        >
          <Text style={styles.buttonOutlineText}>{applyingCoupon ? '…' : 'Aplicar'}</Text>
        </Pressable>
      </View>
      {couponError && <Text style={styles.error}>{couponError}</Text>}

      <Text style={styles.fieldLabel}>Quando</Text>
      <View style={styles.scheduleRow}>
        <Pressable style={[styles.scheduleChip, schedulePreset === null && { borderColor: brand.corPrimaria }]} onPress={() => setSchedulePreset(null)}>
          <Text style={[styles.scheduleChipText, schedulePreset === null && { color: brand.corPrimaria }]}>Agora</Text>
        </Pressable>
        {SCHEDULE_PRESETS.map((preset) => (
          <Pressable
            key={preset.label}
            style={[styles.scheduleChip, schedulePreset === preset.label && { borderColor: brand.corPrimaria }]}
            onPress={() => setSchedulePreset(preset.label)}
          >
            <Text style={[styles.scheduleChipText, schedulePreset === preset.label && { color: brand.corPrimaria }]}>
              {preset.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Forma de pagamento</Text>
      <Text style={styles.hint}>O pagamento é feito direto ao motorista, no fim da corrida.</Text>
      {PAYMENT_METHODS.map((method) => (
        <Pressable key={method} style={styles.paymentRow} onPress={() => setPaymentMethod(method)}>
          <View style={[styles.radioOuter, paymentMethod === method && { borderColor: brand.corPrimaria }]}>
            {paymentMethod === method && <View style={[styles.radioInner, { backgroundColor: brand.corPrimaria }]} />}
          </View>
          <Text style={styles.rideAddress}>{PAYMENT_METHOD_LABEL[method]}</Text>
        </Pressable>
      ))}
      {PAYMENT_LIMIT_HINT[paymentMethod] && <Text style={styles.hint}>{PAYMENT_LIMIT_HINT[paymentMethod]}</Text>}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: brand.corPrimaria }, (!originPoint || sending) && styles.buttonDisabled]}
        disabled={!originPoint || sending}
        onPress={handleConfirm}
      >
        <Text style={styles.buttonText}>
          {!originPoint ? 'Localizando…' : sending ? 'Pedindo…' : schedulePreset ? 'Agendar corrida' : 'Confirmar corrida'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function formatCurrency(value: string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Geocodificação reversa pelo geocoder nativo do aparelho (Apple/Google via
// expo-location) — diferente do Google Places (autocomplete de texto,
// decisão deliberada de não usar, ver ARQUITETURA.md), isso não precisa de
// chave nem de billing: é o mesmo SO que já resolve o GPS. Web não suporta
// (expo-location não implementa lá), mas a tela de marcar no mapa já é
// inacessível na web (MAP_AVAILABLE=false).
async function reverseGeocodeAddress(point: { lat: number; lng: number }): Promise<string | null> {
  try {
    const [result] = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng });
    if (!result) return null;
    const street = [result.street, result.streetNumber].filter(Boolean).join(', ');
    const area = [result.district, result.city].filter(Boolean).join(' - ');
    const address = [street || result.name, area].filter(Boolean).join(', ');
    return address || null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  screenPadding: { padding: spacing.xl, paddingTop: 64, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  brandLogo: { width: 32, height: 32, borderRadius: radius.sm },
  brandLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  brandLogoLetter: { color: colors.surface, fontFamily: font.bold, fontSize: 16 },
  brandName: { fontSize: 17, fontFamily: font.bold, color: colors.textPrimary },
  subtitle: { fontSize: 14, fontFamily: font.regular, color: colors.textSecondary, marginBottom: spacing.xl },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  button: { width: '100%', borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', marginTop: spacing.sm },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontFamily: font.semiBold, fontSize: 15 },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  buttonOutlineText: { color: colors.textPrimary, fontFamily: font.semiBold, fontSize: 15 },
  callButton: { marginTop: 10 },
  cancelBox: { marginTop: 4 },
  error: { color: colors.danger, fontFamily: font.medium, marginBottom: spacing.sm, fontSize: 13 },
  hint: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 20, textAlign: 'center' },
  logoutText: { color: colors.textSecondary, fontFamily: font.medium, fontSize: 14 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  driverName: { fontSize: 20, fontFamily: font.extraBold, color: colors.textPrimary, marginBottom: spacing.md },
  rideLoading: { marginTop: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: font.regular, fontSize: 14, marginBottom: spacing.md },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  topBarPlain: { marginBottom: spacing.md },
  topOverlayHome: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: spacing.sm },
  topOverlayContent: { paddingHorizontal: spacing.lg },
  brandPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '70%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginTop: 10,
    ...shadow.card,
  },
  searchEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.md + 4,
    marginTop: spacing.xs,
  },
  searchEntryText: { fontSize: 16, fontFamily: font.medium, color: colors.textSecondary },
  brandPillLogo: { width: 20, height: 20, borderRadius: 6 },
  brandPillText: { color: colors.surface, fontFamily: font.extraBold, fontSize: 15, letterSpacing: 0.3, flexShrink: 1 },
  topBarFloating: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: 10,
    ...shadow.card,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '60%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.floating,
  },
  bottomSheetContent: { padding: spacing.xl },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md + 2 },
  rideStatus: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.xs + 2 },
  rideAddress: { fontSize: 14, fontFamily: font.medium, color: colors.textPrimary, marginBottom: spacing.xs },
  ridePrice: { fontSize: 22, fontFamily: font.extraBold, color: colors.textPrimary },
  rideMeta: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary, marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md + 2, marginTop: spacing.md, marginBottom: spacing.sm },
  driverCardName: { fontSize: 16, fontFamily: font.bold, color: colors.textPrimary },
  etaText: { fontSize: 13, fontFamily: font.bold, marginTop: 2 },
  chatBox: { marginTop: spacing.md + 2 },
  chatEmpty: { color: colors.textSecondary, fontFamily: font.regular, fontSize: 13, marginBottom: spacing.sm },
  chatMessages: { marginBottom: spacing.sm + 2 },
  chatBubble: { borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: 6, maxWidth: '80%' },
  chatBubbleMine: { alignSelf: 'flex-end' },
  chatBubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
  chatBubbleTextMine: { color: colors.surface, fontFamily: font.medium, fontSize: 14 },
  chatBubbleTextTheirs: { color: colors.textPrimary, fontFamily: font.medium, fontSize: 14 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chatInput: { flex: 1, width: undefined, marginBottom: 0 },
  chatSendCircle: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  starsRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  noteToggle: { fontSize: 13, fontFamily: font.medium, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md + 2, textDecorationLine: 'underline' },
  addressList: { maxHeight: 360, marginBottom: spacing.lg },
  addressRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  addressLabel: { fontSize: 12, fontFamily: font.semiBold, color: colors.textTertiary, marginBottom: 2 },
  fieldLabel: { fontSize: 13, fontFamily: font.semiBold, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.sm },
  fareBox: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.lg, marginVertical: spacing.md, alignItems: 'center' },
  paymentInfoBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: 2 },
  paymentInfoTitle: { fontSize: 14, fontFamily: font.bold, color: colors.textPrimary },
  pixRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  pixKeyText: { flex: 1, fontSize: 15, fontFamily: font.semiBold, color: colors.textPrimary },
  pixCopyButton: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pixCopyText: { fontSize: 13, fontFamily: font.semiBold },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.sm },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  tabBarRow: { flexDirection: 'row', height: 60 },
  tabBarItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIconWrap: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabIconActiveBg: { opacity: 0.14, borderRadius: radius.pill },
  tabBarLabel: { fontSize: 12, fontFamily: font.medium, color: colors.textTertiary },
  tabBarLabelActive: { color: colors.textPrimary, fontFamily: font.semiBold },
  tabScreenPadding: { padding: spacing.xl, paddingTop: 64, paddingBottom: TAB_BAR_HEIGHT + spacing.xl, flexGrow: 1 },
  sectionTitle: { fontSize: 15, fontFamily: font.bold, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  logoutButton: { backgroundColor: colors.danger, marginTop: spacing.xxl },
  supportHistory: { marginTop: spacing.lg },
  supportReplyBox: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  supportReplyLabel: { fontSize: 11, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  supportPending: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 6, fontStyle: 'italic' },
  historyRow: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md + 2, marginBottom: spacing.sm + 2 },
  historyRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  historyRowFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  historyStatus: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuRowText: { fontSize: 15, fontFamily: font.semiBold, color: colors.textPrimary },
  menuRowChevron: { fontSize: 18, color: colors.textTertiary },
  topUpRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  topUpInput: { flex: 1 },
  topUpButton: { width: 'auto', flexGrow: 0, flexShrink: 0, marginTop: 0, paddingHorizontal: 18 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeLink: { color: colors.danger, fontFamily: font.semiBold, fontSize: 13 },
  editLink: { color: colors.textPrimary, fontFamily: font.semiBold, fontSize: 13 },
  addressActions: { flexDirection: 'row', gap: spacing.lg },
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.sm - 2, borderWidth: 2, borderColor: colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
  checkboxMark: { color: colors.surface, fontFamily: font.bold, fontSize: 14 },
  couponAppliedText: { fontSize: 12, fontFamily: font.semiBold, marginTop: 4 },
  scheduleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  scheduleChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm },
  scheduleChipText: { fontSize: 13, fontFamily: font.semiBold, color: colors.textSecondary },
  searchBarFloating: { gap: spacing.sm, marginTop: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: font.regular, color: colors.textPrimary, paddingVertical: 4 },
  searchErrorFloating: { backgroundColor: colors.surface, borderRadius: radius.sm + 2, padding: spacing.sm + 2, marginTop: spacing.sm, marginBottom: 0 },
});

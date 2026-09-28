import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { driverApi, loadSession, login, logout, subscribeSession } from './src/api';
import { connectSocket, disconnectSocket } from './src/socket';
import { fetchBranding, Branding } from './src/brand';
import { MapSection } from './src/MapSection';
import {
  BlockedCustomer,
  DriverProfile,
  DriverSession,
  DriverSummary,
  Ride,
  RideHistoryEntry,
  RideMessage,
  RideStatus,
  ScheduledRide,
  SupportMessage,
  PaymentMethod,
} from './src/types';
import { colors, font, radius, shadow, spacing } from './src/theme';

const TAB_BAR_HEIGHT = 60;

const STATUS_LABEL: Record<RideStatus, string> = {
  REQUESTED: 'Solicitada',
  SEARCHING_DRIVER: 'Procurando motorista',
  DRIVER_ASSIGNED: 'Nova corrida',
  DRIVER_EN_ROUTE: 'A caminho do passageiro',
  PASSENGER_ABOARD: 'Passageiro a bordo',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<DriverSession | null>(null);
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

  const handleLoggedIn = useCallback((next: DriverSession) => setSession(next), []);
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

function LoginScreen({ brand, onLoggedIn }: { brand: Branding; onLoggedIn: (session: DriverSession) => void }) {
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
      <Text style={styles.subtitle}>Acesso do motorista</Text>

      <TextInput
        style={styles.input}
        placeholder="CPF"
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
        maxLength={11}
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, { backgroundColor: brand.corPrimaria }, pending && styles.buttonDisabled]}
        disabled={pending || cpf.length !== 11 || password.length < 6}
        onPress={handleSubmit}
      >
        <Text style={styles.buttonText}>{pending ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>

      <Text style={styles.hint}>Sem senha ainda? Fale com a central — ela é definida no cadastro do motorista.</Text>
    </View>
  );
}

type HomeTab = 'inicio' | 'programadas' | 'atividade' | 'conta';

function HomeScreen({ session, brand, onLoggedOut }: { session: DriverSession; brand: Branding; onLoggedOut: () => void }) {
  const [activeTab, setActiveTab] = useState<HomeTab>('inicio');
  const [availability, setAvailability] = useState(session.driver.availability);
  const [ride, setRide] = useState<Ride | null>(null);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
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
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  // O efeito que conecta o socket roda uma única vez (deps []), então o
  // callback que ele registra fecha sobre o `ride` da primeira renderização —
  // sem essa ref, todo 'ride-message.created' buscaria mensagens da corrida
  // errada (ou de nenhuma).
  const rideRef = useRef<Ride | null>(null);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);
  // Ação do próprio motorista (aceitar/recusar) em andamento: aí sumir a oferta não é "expirou".
  const actionPendingRef = useRef(false);
  useEffect(() => {
    actionPendingRef.current = actionPending;
  }, [actionPending]);
  const isOnline = availability !== 'OFFLINE';

  const refreshRide = useCallback(async () => {
    try {
      const { ride: current } = await driverApi.currentRide();
      // Oferta que sumiu sem o motorista ter tocado em nada (o prazo venceu e a corrida passou ao próximo).
      const previous = rideRef.current;
      if (previous?.status === 'DRIVER_ASSIGNED' && current?.id !== previous.id && !actionPendingRef.current) {
        setError('A oferta expirou e foi repassada para outro motorista.');
      }
      setRide(current);
    } catch (err) {
      if (err instanceof Error && err.message.includes('expirada')) onLoggedOut();
    } finally {
      setLoadingRide(false);
    }
  }, [onLoggedOut]);

  const refreshMessages = useCallback(async () => {
    const current = rideRef.current;
    if (!current) {
      setMessages([]);
      return;
    }
    try {
      setMessages(await driverApi.rideMessages(current.id));
    } catch {
      // próximo poll/evento de socket corrige
    }
  }, []);

  useEffect(() => {
    refreshMessages();
  }, [ride?.id, refreshMessages]);

  // A sessão guardada tem a disponibilidade do momento do login: reabrir o app depois de ficar
  // offline mostrava "Online" (e o motorista achava que recebia corridas). Vale o que o servidor tem.
  useEffect(() => {
    driverApi
      .me()
      .then((me: { availability?: typeof availability }) => {
        if (me?.availability) setAvailability(me.availability);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshRide();
    const socket = connectSocket(refreshRide, refreshMessages);
    const poll = setInterval(refreshRide, 20000);
    return () => {
      disconnectSocket();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centraliza o mapa na posição do motorista assim que possível, independente de
  // estar online — só a atualização enviada ao servidor (abaixo) depende disso.
  // Sem mapa no target web, não faz sentido nem pedir a permissão aqui.
  useEffect(() => {
    if (Platform.OS === 'web') return;
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

  useEffect(() => {
    if (!isOnline) {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 50 },
        (position) => {
          setMyLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          driverApi.updateLocation(position.coords.latitude, position.coords.longitude).catch(() => undefined);
        },
      );
    })();

    return () => {
      cancelled = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [isOnline]);

  // Online = tela ligada: com a tela bloqueada o sistema pausa o app, o sinal de vida para e em 3 min o
  // servidor coloca o motorista offline sem ele perceber. Volta ao normal quando fica offline / sai da tela.
  useEffect(() => {
    if (!isOnline) return;
    activateKeepAwakeAsync('motorista-online').catch(() => undefined); // navegador sem Wake Lock: segue sem
    return () => {
      deactivateKeepAwake('motorista-online').catch(() => undefined);
    };
  }, [isOnline]);

  // Enquanto online, dá sinal de vida ao servidor a cada 60 s (e ao voltar pro primeiro plano): sem
  // sinal por 3 min o servidor entende que o app fechou e para de oferecer corridas. A resposta traz a
  // disponibilidade real — se o servidor já colocou o motorista offline, o botão acompanha.
  const toggling = useRef(false);
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const beat = () =>
      driverApi
        .heartbeat()
        .then(({ availability: real }) => {
          if (!cancelled && !toggling.current && real === 'OFFLINE') setAvailability('OFFLINE');
        })
        .catch(() => undefined); // sem internet agora: o próximo sinal tenta de novo
    beat();
    const timer = setInterval(beat, 60000);
    const appState = AppState.addEventListener('change', (state) => state === 'active' && beat());
    return () => {
      cancelled = true;
      clearInterval(timer);
      appState.remove();
    };
  }, [isOnline]);

  async function toggleAvailability(next: boolean) {
    const target = next ? 'AVAILABLE' : 'OFFLINE';
    setAvailability(target as typeof availability);
    toggling.current = true;
    try {
      await driverApi.setAvailability(target);
    } catch (err) {
      setAvailability(isOnline ? 'AVAILABLE' : 'OFFLINE');
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      toggling.current = false;
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionPending(true);
    setError(null);
    try {
      await action();
      await refreshRide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
      refreshRide();
    } finally {
      setActionPending(false);
    }
  }

  async function handleComplete() {
    if (!ride) return;
    setActionPending(true);
    setError(null);
    try {
      await driverApi.complete(ride.id);
      setRatingRide(ride);
      setRide(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
      refreshRide();
    } finally {
      setActionPending(false);
    }
  }

  async function handleSendMessage(text: string) {
    if (!ride) return;
    await driverApi.sendRideMessage(ride.id, text);
    await refreshMessages();
  }

  return (
    <View style={styles.flex1}>
      {activeTab === 'inicio' && (
        <>
          <View style={styles.mapLayer}>
            <MapSection location={myLocation} />
          </View>

          <SafeAreaView style={[styles.topOverlayHome, { pointerEvents: 'box-none' }]}>
            <View style={styles.topOverlayContent} pointerEvents="box-none">
            <BrandPill brand={brand} />
            <View style={styles.availabilityPill}>
              <Text style={styles.availabilityLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
              <Switch value={isOnline} onValueChange={toggleAvailability} disabled={!!ride} trackColor={{ true: brand.corPrimaria }} thumbColor={colors.surface} />
            </View>
            </View>
          </SafeAreaView>

          <SafeAreaView style={[styles.bottomSheet, { bottom: TAB_BAR_HEIGHT }]}>
            <ScrollView contentContainerStyle={styles.bottomSheetContent} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHandle} />
              <Text style={styles.driverName}>{session.driver.name}</Text>
              {error && <Text style={styles.error}>{error}</Text>}

              {ratingRide ? (
                <RatingScreen
                  ride={ratingRide}
                  brand={brand}
                  onDone={() => {
                    setRatingRide(null);
                    refreshRide();
                  }}
                />
              ) : loadingRide ? (
                <ActivityIndicator style={styles.rideLoading} color={brand.corPrimaria} />
              ) : !ride ? (
                <View style={styles.emptyCardFlat}>
                  <Text style={styles.emptyText}>
                    {isOnline ? 'Nenhuma corrida no momento. Você será avisado assim que uma chegar.' : 'Fique online para receber corridas.'}
                  </Text>
                </View>
              ) : (
                <RideCard
                  ride={ride}
                  brand={brand}
                  pending={actionPending}
                  onAction={runAction}
                  onComplete={handleComplete}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </>
      )}

      {activeTab === 'programadas' && <ProgramadasTab brand={brand} />}
      {activeTab === 'atividade' && <AtividadeTab brand={brand} />}
      {activeTab === 'conta' && <ContaTab session={session} brand={brand} onLoggedOut={onLoggedOut} />}

      <BottomTabBar active={activeTab} onChange={setActiveTab} brand={brand} />
    </View>
  );
}

const TAB_ICON: Record<HomeTab, keyof typeof Feather.glyphMap> = {
  inicio: 'home',
  programadas: 'calendar',
  atividade: 'activity',
  conta: 'user',
};

function BottomTabBar({ active, onChange, brand }: { active: HomeTab; onChange: (tab: HomeTab) => void; brand: Branding }) {
  const tabs: { key: HomeTab; label: string }[] = [
    { key: 'inicio', label: 'Início' },
    { key: 'programadas', label: 'Programadas' },
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
                <Feather name={TAB_ICON[tab.key]} size={20} color={isActive ? brand.corPrimaria : colors.textTertiary} />
              </View>
              <Text style={[styles.tabBarLabel, isActive && [styles.tabBarLabelActive, { color: brand.corPrimaria }]]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function ProgramadasTab({ brand }: { brand: Branding }) {
  const [items, setItems] = useState<ScheduledRide[] | null>(null);

  useEffect(() => {
    driverApi
      .scheduledRides()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <SafeAreaView style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.tabScreenPadding}>
        <Text style={styles.driverName}>Programadas</Text>
        {items === null ? (
          <ActivityIndicator color={brand.corPrimaria} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma corrida agendada atribuída a você no momento.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyRowHeader}>
                <Text style={[styles.historyStatus, { color: brand.corPrimaria }]}>{STATUS_LABEL[item.status]}</Text>
                <Text style={styles.rideMeta}>
                  {new Date(item.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.rideCustomer}>{item.customer.name}</Text>
              <Text style={styles.rideAddress}>
                {item.originAddress} → {item.destinationAddress}
              </Text>
              {item.finalPrice && <Text style={styles.rideMeta}>{formatCurrency(item.finalPrice)}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AtividadeTab({ brand }: { brand: Branding }) {
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  // Falha ao carregar não pode virar "R$ 0,00": o motorista leria como se não tivesse rodado nada.
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [items, setItems] = useState<RideHistoryEntry[] | null>(null);

  useEffect(() => {
    driverApi
      .summary()
      .then(setSummary)
      .catch(() => setSummaryFailed(true));
    driverApi
      .rideHistory()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <SafeAreaView style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.tabScreenPadding}>
        <Text style={styles.driverName}>Resumo</Text>
        {summaryFailed ? (
          <Text style={styles.emptyText}>Não foi possível carregar o resumo agora. Feche e abra esta aba para tentar de novo.</Text>
        ) : summary === null ? (
          <ActivityIndicator color={brand.corPrimaria} />
        ) : (
          <View style={styles.earningsRow}>
            {(
              [
                ['Hoje', summary.today],
                ['Neste mês', summary.month],
              ] as const
            ).map(([label, totals]) => (
              <View key={label} style={styles.earningsCard}>
                <Text style={styles.rideMeta}>{label}</Text>
                <Text style={styles.ridePrice}>{formatCurrency(String(totals.total))}</Text>
                <Text style={styles.rideMeta}>
                  {totals.rides} {totals.rides === 1 ? 'corrida' : 'corridas'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Atividade</Text>
        {items === null ? (
          <ActivityIndicator color={brand.corPrimaria} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma corrida até o momento.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyRowHeader}>
                <Text style={[styles.historyStatus, { color: brand.corPrimaria }]}>{STATUS_LABEL[item.status]}</Text>
                <Text style={styles.rideMeta}>{new Date(item.requestedAt).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text style={styles.rideAddress}>
                {item.originAddress} → {item.destinationAddress}
              </Text>
              <View style={styles.historyRowFooter}>
                <Text style={styles.rideMeta}>{item.customer?.name ?? 'Sem passageiro'}</Text>
                {item.finalPrice && <Text style={styles.rideMeta}>{formatCurrency(item.finalPrice)}</Text>}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContaTab({ session, brand, onLoggedOut }: { session: DriverSession; brand: Branding; onLoggedOut: () => void }) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[] | null>(null);
  const [blockedCustomers, setBlockedCustomers] = useState<BlockedCustomer[] | null>(null);
  // Como o motorista recebe: o passageiro paga direto a ele (Pix na chave, cartão na máquina, dinheiro).
  const [pixKey, setPixKey] = useState('');
  const [hasCardMachine, setHasCardMachine] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setPixKey(profile.pixKey ?? '');
    setHasCardMachine(!!profile.hasCardMachine);
  }, [profile]);

  async function handleSavePayment() {
    setPaymentError(null);
    setPaymentSaving(true);
    try {
      await driverApi.updatePayment({ pixKey: pixKey.trim(), hasCardMachine });
      setPaymentSaved(true);
      setTimeout(() => setPaymentSaved(false), 2000);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setPaymentSaving(false);
    }
  }

  const refreshSupportMessages = useCallback(() => {
    driverApi
      .supportMessages()
      .then(setSupportMessages)
      .catch(() => undefined);
  }, []);

  const refreshBlockedCustomers = useCallback(() => {
    driverApi
      .listBlockedCustomers()
      .then(setBlockedCustomers)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    driverApi
      .me()
      .then(setProfile)
      .catch(() => undefined);
    refreshSupportMessages();
    refreshBlockedCustomers();
  }, [refreshSupportMessages, refreshBlockedCustomers]);

  async function handleUnblockCustomer(customerId: string) {
    await driverApi.unblockCustomer(customerId);
    refreshBlockedCustomers();
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      await driverApi.changePassword(currentPassword, newPassword);
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
      await driverApi.sendSupportMessage(supportMessage.trim());
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
    // Sair da conta deixa de receber corridas; sem isso ficava "disponível" no despacho mesmo com o app fechado.
    await driverApi.setAvailability('OFFLINE').catch(() => undefined);
    await logout();
    onLoggedOut();
  }

  return (
    <SafeAreaView style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.tabScreenPadding}>
        <Text style={styles.driverName}>{profile?.name ?? session.driver.name}</Text>
        {profile?.phone && <Text style={styles.rideMeta}>{profile.phone}</Text>}
        {profile?.vehicles[0] && (
          <Text style={styles.rideMeta}>
            {profile.vehicles[0].brand} {profile.vehicles[0].model} · {profile.vehicles[0].plate}
          </Text>
        )}
        {profile?.rating && <RatingBadge rating={Number(profile.rating)} />}

        <Text style={styles.sectionTitle}>Como você recebe</Text>
        <Text style={styles.hint}>
          O passageiro paga direto a você, fora do app. Corridas no Pix só chegam se você tiver uma chave cadastrada; no cartão, só se tiver
          máquina no carro.
        </Text>
        <TextInput style={styles.input} placeholder="Sua chave Pix (CPF, e-mail, celular ou aleatória)" autoCapitalize="none" value={pixKey} onChangeText={setPixKey} />
        <View style={styles.availabilityPill}>
          <Text style={styles.availabilityLabel}>Tenho máquina de cartão</Text>
          <Switch value={hasCardMachine} onValueChange={setHasCardMachine} trackColor={{ true: brand.corPrimaria }} thumbColor={colors.surface} />
        </View>
        {paymentError && <Text style={styles.error}>{paymentError}</Text>}
        <Pressable
          style={[styles.button, styles.buttonOutline, paymentSaving && styles.buttonDisabled]}
          disabled={paymentSaving}
          onPress={handleSavePayment}
        >
          <Text style={styles.buttonOutlineText}>{paymentSaving ? 'Salvando…' : paymentSaved ? 'Salvo ✓' : 'Salvar'}</Text>
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

        <Text style={styles.sectionTitle}>Passageiros bloqueados</Text>
        {blockedCustomers && blockedCustomers.length === 0 ? (
          <Text style={styles.emptyText}>
            Você não bloqueou nenhum passageiro. Depois de uma corrida, avalie o passageiro e marque para bloquear.
          </Text>
        ) : (
          blockedCustomers?.map((b) => (
            <View key={b.id} style={[styles.historyRow, styles.cardRow]}>
              <View>
                <Text style={styles.rideAddress}>{b.customer.name}</Text>
                {b.customer.rating && <RatingBadge rating={Number(b.customer.rating)} />}
              </View>
              <Pressable onPress={() => handleUnblockCustomer(b.customerId)}>
                <Text style={styles.removeLink}>Desbloquear</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Text style={styles.buttonText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const NAVIGATE_TO_ORIGIN: RideStatus[] = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE'];
const DECLINE_REASONS = ['Muito longe', 'Sem condição de ir agora', 'Endereço suspeito', 'Outro motivo'];

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

// O passageiro paga direto ao motorista, fora do app — a oferta já diz como, para o motorista decidir e se preparar.
const PAYMENT_TITLE: Record<PaymentMethod, string> = {
  CASH: 'Pagamento em dinheiro',
  PIX: 'Pagamento via Pix',
  CREDIT_CARD: 'Pagamento no cartão de crédito',
  DEBIT_CARD: 'Pagamento no cartão de débito',
  WALLET: 'Pago pela carteira do app',
};
const PAYMENT_HINT: Record<PaymentMethod, string> = {
  CASH: 'Receba do passageiro no fim da corrida (leve troco).',
  PIX: 'O passageiro paga na sua chave Pix no fim da corrida.',
  CREDIT_CARD: 'Passe na sua máquina de cartão no fim da corrida.',
  DEBIT_CARD: 'Passe na sua máquina de cartão no fim da corrida.',
  WALLET: 'Já descontado do saldo do passageiro — nada a cobrar.',
};

// Segundos até a oferta vencer (atualiza a cada 1 s); null quando a corrida não tem prazo.
function useOfferCountdown(expiresAt: string | null | undefined): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : null;
}

function RideCard({
  ride,
  brand,
  pending,
  onAction,
  onComplete,
  messages,
  onSendMessage,
}: {
  ride: Ride;
  brand: Branding;
  pending: boolean;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
  onComplete: () => Promise<void>;
  messages: RideMessage[];
  onSendMessage: (text: string) => Promise<void>;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [noteSent, setNoteSent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [customDeclineReason, setCustomDeclineReason] = useState('');

  const secondsLeft = useOfferCountdown(ride.status === 'DRIVER_ASSIGNED' ? ride.offerExpiresAt : null);
  const isOtherDecline = declineReason === 'Outro motivo';
  const finalDeclineReason = (isOtherDecline ? customDeclineReason.trim() : declineReason) ?? '';

  const target = NAVIGATE_TO_ORIGIN.includes(ride.status)
    ? { lat: ride.originLat, lng: ride.originLng }
    : { lat: ride.destinationLat, lng: ride.destinationLng };

  async function handleSendNote() {
    setNoteSending(true);
    try {
      await driverApi.sendNote(ride.id, note.trim());
      setNote('');
      setNoteSent(true);
      setTimeout(() => setNoteSent(false), 2000);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a observação.');
    } finally {
      setNoteSending(false);
    }
  }

  return (
    <View style={styles.rideCard}>
      <Text style={[styles.rideStatus, { color: brand.corPrimaria }]}>{STATUS_LABEL[ride.status]}</Text>
      {secondsLeft != null && (
        <Text style={styles.rideMeta}>{secondsLeft > 0 ? `Responda em ${secondsLeft}s` : 'Tempo esgotado…'}</Text>
      )}
      <Text style={styles.rideCustomer}>{ride.customer.name}</Text>
      <Text style={styles.rideAddress}>De: {ride.originAddress}</Text>
      <Text style={styles.rideAddress}>Para: {ride.destinationAddress}</Text>
      {ride.distanceKm && <Text style={styles.rideMeta}>Trajeto: {ride.distanceKm} km</Text>}
      {ride.finalPrice && <Text style={styles.ridePrice}>{formatCurrency(ride.finalPrice)}</Text>}
      {ride.paymentMethod && (
        <View style={styles.paymentBox}>
          <Text style={styles.paymentTitle}>{PAYMENT_TITLE[ride.paymentMethod]}</Text>
          <Text style={styles.rideMeta}>{PAYMENT_HINT[ride.paymentMethod]}</Text>
        </View>
      )}

      <View style={styles.secondaryActions}>
        {!!ride.customer.phone && (
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => Linking.openURL(`tel:${ride.customer.phone!.replace(/\D/g, '')}`)}
          >
            <View style={styles.buttonContent}>
              <Feather name="phone" size={15} color={colors.textPrimary} />
              <Text style={styles.secondaryButtonText}>Ligar para o passageiro</Text>
            </View>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`)}
        >
          <View style={styles.buttonContent}>
            <Feather name="navigation" size={15} color={colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Navegar</Text>
          </View>
        </Pressable>
      </View>

      <ChatSection brand={brand} messages={messages} mine="driver" onSend={onSendMessage} />

      {noteOpen ? (
        <View style={styles.noteBox}>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="Ex.: trânsito parado, vou atrasar um pouco"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Pressable
            style={[styles.button, styles.buttonOutline, note.trim().length === 0 && styles.buttonDisabled]}
            disabled={note.trim().length === 0 || noteSending}
            onPress={handleSendNote}
          >
            <Text style={styles.buttonOutlineText}>{noteSending ? 'Enviando…' : noteSent ? 'Enviado ✓' : 'Enviar para a central'}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setNoteOpen(true)}>
          <Text style={styles.noteToggle}>Enviar observação para a central</Text>
        </Pressable>
      )}

      {ride.status === 'DRIVER_ASSIGNED' && declineOpen && (
        <View style={styles.noteBox}>
          <Text style={styles.fieldLabel}>Por que está recusando?</Text>
          <View style={styles.reasonChipsRow}>
            {DECLINE_REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={[styles.reasonChip, declineReason === reason && { borderColor: brand.corPrimaria }]}
                onPress={() => setDeclineReason(reason)}
              >
                <Text style={[styles.reasonChipText, declineReason === reason && { color: brand.corPrimaria }]}>{reason}</Text>
              </Pressable>
            ))}
          </View>
          {isOtherDecline && (
            <TextInput style={styles.input} placeholder="Descreva o motivo" value={customDeclineReason} onChangeText={setCustomDeclineReason} />
          )}
        </View>
      )}

      <View style={styles.rideActions}>
        {ride.status === 'DRIVER_ASSIGNED' && !declineOpen && (
          <>
            <Pressable
              style={[styles.button, styles.buttonFlex, { backgroundColor: brand.corPrimaria }]}
              disabled={pending}
              onPress={() => onAction(() => driverApi.accept(ride.id))}
            >
              <Text style={styles.buttonText}>Aceitar</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonFlex, styles.buttonOutline]} disabled={pending} onPress={() => setDeclineOpen(true)}>
              <Text style={styles.buttonOutlineText}>Recusar</Text>
            </Pressable>
          </>
        )}
        {ride.status === 'DRIVER_ASSIGNED' && declineOpen && (
          <>
            <Pressable
              style={[styles.button, styles.buttonFlex, { backgroundColor: brand.corPrimaria }, (!finalDeclineReason || pending) && styles.buttonDisabled]}
              disabled={!finalDeclineReason || pending}
              onPress={() => onAction(() => driverApi.decline(ride.id, finalDeclineReason))}
            >
              <Text style={styles.buttonText}>Confirmar recusa</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonFlex, styles.buttonOutline]} disabled={pending} onPress={() => setDeclineOpen(false)}>
              <Text style={styles.buttonOutlineText}>Voltar</Text>
            </Pressable>
          </>
        )}
        {ride.status === 'DRIVER_EN_ROUTE' && (
          <Pressable
            style={[styles.button, { backgroundColor: brand.corPrimaria }]}
            disabled={pending}
            onPress={() => onAction(() => driverApi.passengerAboard(ride.id))}
          >
            <Text style={styles.buttonText}>Passageiro embarcou</Text>
          </Pressable>
        )}
        {ride.status === 'PASSENGER_ABOARD' && (
          <Pressable
            style={[styles.button, { backgroundColor: brand.corPrimaria }]}
            disabled={pending}
            onPress={() => onAction(() => driverApi.start(ride.id))}
          >
            <Text style={styles.buttonText}>Iniciar corrida</Text>
          </Pressable>
        )}
        {ride.status === 'IN_PROGRESS' && (
          <Pressable style={[styles.button, { backgroundColor: brand.corPrimaria }]} disabled={pending} onPress={onComplete}>
            <Text style={styles.buttonText}>Finalizar corrida</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function RatingScreen({ ride, brand, onDone }: { ride: Ride; brand: Branding; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [blockCustomer, setBlockCustomer] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleConfirm() {
    if (stars === 0) return;
    setSending(true);
    try {
      await driverApi.rateCustomer(ride.id, stars);
      if (blockCustomer) await driverApi.blockCustomer(ride.customer.id).catch(() => undefined);
    } catch {
      // corrida pode já ter sido avaliada, ou a rede falhou — não vale travar o motorista por isso
    } finally {
      setSending(false);
      onDone();
    }
  }

  return (
    <View style={styles.rideCard}>
      <Text style={[styles.rideStatus, { color: brand.corPrimaria }]}>Corrida finalizada</Text>
      <Text style={styles.rideCustomer}>Avalie {ride.customer.name}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setStars(n)}>
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={n <= stars ? brand.corPrimaria : colors.textTertiary} />
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.favoriteToggleRow} onPress={() => setBlockCustomer((v) => !v)}>
        <View style={[styles.checkbox, blockCustomer && { backgroundColor: brand.corPrimaria, borderColor: brand.corPrimaria }]}>
          {blockCustomer && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.rideAddress}>Não quero mais corridas com {ride.customer.name}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, { backgroundColor: brand.corPrimaria }, stars === 0 && styles.buttonDisabled]}
        disabled={stars === 0 || sending}
        onPress={handleConfirm}
      >
        <Text style={styles.buttonText}>{sending ? 'Enviando…' : 'Confirmar'}</Text>
      </Pressable>
      <Pressable onPress={onDone} disabled={sending}>
        <Text style={styles.noteToggle}>Agora não</Text>
      </Pressable>
    </View>
  );
}

function formatCurrency(value: string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  buttonFlex: { flex: 1 },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontFamily: font.semiBold, fontSize: 15 },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  buttonOutlineText: { color: colors.textPrimary, fontFamily: font.semiBold, fontSize: 15 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  error: { color: colors.danger, fontFamily: font.medium, marginBottom: spacing.sm, fontSize: 13 },
  hint: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 20, textAlign: 'center' },
  logoutText: { color: colors.textSecondary, fontFamily: font.medium, fontSize: 14 },
  driverName: { fontSize: 20, fontFamily: font.extraBold, color: colors.textPrimary, marginBottom: spacing.md },
  availabilityLabel: { fontSize: 16, fontFamily: font.semiBold, color: colors.textPrimary },
  rideLoading: { marginTop: spacing.xl },
  emptyCardFlat: { paddingVertical: 4, paddingBottom: spacing.xl },
  emptyText: { color: colors.textSecondary, fontFamily: font.regular, fontSize: 14 },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
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
  availabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginTop: 10,
    ...shadow.card,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.floating,
  },
  bottomSheetContent: { padding: spacing.xl },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md + 2 },
  rideCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.lg + 2 },
  rideStatus: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.xs + 2 },
  rideCustomer: { fontSize: 18, fontFamily: font.extraBold, color: colors.textPrimary, marginBottom: spacing.sm + 2 },
  rideAddress: { fontSize: 14, fontFamily: font.medium, color: colors.textPrimary, marginBottom: spacing.xs },
  ridePrice: { fontSize: 18, fontFamily: font.extraBold, color: colors.textPrimary, marginTop: spacing.sm },
  rideMeta: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary, marginTop: 4 },
  rideActions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  secondaryActions: { flexDirection: 'row', gap: 10, marginTop: spacing.md + 2 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 13, fontFamily: font.semiBold, color: colors.textPrimary },
  noteToggle: { fontSize: 13, fontFamily: font.medium, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md + 2, textDecorationLine: 'underline' },
  noteBox: { marginTop: spacing.md + 2 },
  noteInput: { minHeight: 70, textAlignVertical: 'top', marginBottom: spacing.sm },
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
  favoriteToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  checkbox: { width: 22, height: 22, borderRadius: radius.sm - 2, borderWidth: 2, borderColor: colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
  checkboxMark: { color: colors.surface, fontFamily: font.bold, fontSize: 14 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  tabBarRow: { flexDirection: 'row', height: 60 },
  tabBarItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIconWrap: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabIconActiveBg: { opacity: 0.14, borderRadius: radius.pill },
  tabBarLabel: { fontSize: 11, fontFamily: font.medium, color: colors.textTertiary },
  tabBarLabelActive: { color: colors.textPrimary, fontFamily: font.semiBold },
  tabScreenPadding: { padding: spacing.xl, paddingTop: 64, paddingBottom: TAB_BAR_HEIGHT + spacing.xl, flexGrow: 1 },
  paymentBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: 2 },
  paymentTitle: { fontSize: 14, fontFamily: font.bold, color: colors.textPrimary },
  sectionTitle: { fontSize: 15, fontFamily: font.bold, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  logoutButton: { backgroundColor: colors.danger, marginTop: spacing.xxl },
  supportHistory: { marginTop: spacing.lg },
  supportReplyBox: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  supportReplyLabel: { fontSize: 11, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  supportPending: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 6, fontStyle: 'italic' },
  historyRow: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md + 2, marginBottom: spacing.sm + 2 },
  historyRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  historyRowFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeLink: { color: colors.danger, fontFamily: font.semiBold, fontSize: 13 },
  historyStatus: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 0.3 },
  earningsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  earningsCard: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.lg },
  fieldLabel: { fontSize: 13, fontFamily: font.semiBold, color: colors.textSecondary, marginBottom: spacing.sm },
  reasonChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  reasonChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm },
  reasonChipText: { fontSize: 13, fontFamily: font.semiBold, color: colors.textSecondary },
});

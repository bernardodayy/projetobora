import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

// No Android, react-native-maps precisa de uma chave nativa do Google Maps que
// este projeto ainda não tem configurada — mesma régra do mapa operacional do
// painel admin: sem chave, mostra um aviso em vez de fingir um mapa. iOS usa
// Apple Maps por padrão (sem chave), mas mantemos a mesma trava pelas duas
// plataformas não se comportarem de forma diferente sem essa configuração.
const AVAILABLE = Platform.OS !== 'android' || !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export function MapSection({ location }: { location: { lat: number; lng: number } | null }) {
  if (!AVAILABLE) {
    return <Placeholder text="Mapa indisponível — chave do Google Maps não configurada" />;
  }
  if (!location) {
    return <Placeholder text="Localizando…" />;
  }

  const region = { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  return (
    <MapView style={styles.flex1} showsUserLocation initialRegion={region} region={region}>
      <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} />
    </MapView>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <View style={[styles.flex1, styles.placeholder]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6ece9' },
  text: { color: '#5b6b64', fontSize: 14, textAlign: 'center', paddingHorizontal: 48 },
});

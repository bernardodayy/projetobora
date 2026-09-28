import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

// No Android, react-native-maps precisa de uma chave nativa do Google Maps que
// este projeto ainda não tem configurada — mesma régra do mapa operacional do
// painel admin: sem chave, mostra um aviso em vez de fingir um mapa. iOS usa
// Apple Maps por padrão (sem chave), mas mantemos a mesma trava pelas duas
// plataformas não se comportarem de forma diferente sem essa configuração.
export const MAP_AVAILABLE = Platform.OS !== 'android' || !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface MapMarkerSpec {
  lat: number;
  lng: number;
  color?: string;
}

interface MapSectionProps {
  center: { lat: number; lng: number } | null;
  markers?: MapMarkerSpec[];
  // Modo "escolher no mapa": pino fixo no centro da tela, o usuário arrasta o
  // mapa por baixo — mais preciso que tocar num ponto (sem risco de errar o
  // dedo), e é o padrão universal desse tipo de seletor.
  centerPin?: boolean;
  onRegionChangeComplete?: (center: { lat: number; lng: number }) => void;
}

export function MapSection({ center, markers = [], centerPin, onRegionChangeComplete }: MapSectionProps) {
  if (!MAP_AVAILABLE) {
    return <Placeholder text="Mapa indisponível — chave do Google Maps não configurada" />;
  }
  if (!center) {
    return <Placeholder text="Localizando…" />;
  }

  const region = { latitude: center.lat, longitude: center.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  return (
    <View style={styles.flex1}>
      <MapView
        style={styles.flex1}
        showsUserLocation
        initialRegion={region}
        region={centerPin ? undefined : region}
        onRegionChangeComplete={onRegionChangeComplete ? (r) => onRegionChangeComplete({ lat: r.latitude, lng: r.longitude }) : undefined}
      >
        {markers.map((marker, index) => (
          <Marker key={index} coordinate={{ latitude: marker.lat, longitude: marker.lng }} pinColor={marker.color} />
        ))}
      </MapView>
      {centerPin && (
        <View style={styles.centerPinWrap} pointerEvents="none">
          <Text style={styles.centerPinIcon}>📍</Text>
        </View>
      )}
    </View>
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
  centerPinWrap: { position: 'absolute', top: '50%', left: '50%', marginLeft: -16, marginTop: -32 },
  centerPinIcon: { fontSize: 32 },
});

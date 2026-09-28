import { StyleSheet, Text, View } from 'react-native';

// react-native-maps não tem renderer web — nem importar o módulo é seguro
// aqui (por isso este arquivo, resolvido pelo Metro no lugar de
// MapSection.native.tsx no bundle web). O mapa de verdade só existe no app
// nativo (iOS/Android); ver MapSection.native.tsx.
export const MAP_AVAILABLE = false;

export interface MapMarkerSpec {
  lat: number;
  lng: number;
  color?: string;
}

export function MapSection(_props: {
  center: { lat: number; lng: number } | null;
  markers?: MapMarkerSpec[];
  centerPin?: boolean;
  onRegionChangeComplete?: (center: { lat: number; lng: number }) => void;
}) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Mapa disponível no app (iOS/Android)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6ece9' },
  text: { color: '#5b6b64', fontSize: 14, textAlign: 'center', paddingHorizontal: 48 },
});

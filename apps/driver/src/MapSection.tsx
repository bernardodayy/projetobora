// Nunca é empacotado de verdade — Metro sempre resolve MapSection.native.tsx
// ou MapSection.web.tsx primeiro. Existe só para o TypeScript encontrar um
// módulo base (ele não conhece a convenção de sufixo de plataforma do Metro).
export * from './MapSection.native';

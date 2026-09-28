// Área exclusiva da equipe de desenvolvimento (hoje: marca dos apps). Não é um
// cargo comum: o Administrador Master NÃO recebe essa permissão e as telas de
// Cargos/Usuários escondem e bloqueiam no servidor tudo que a envolve — senão
// o dono desbloquearia sozinho. Pra remover a aba depois, basta apagar isto,
// DeveloperController e o cargo "Desenvolvedor" do seed.
export const DEVELOPER_ROLE_NAME = 'Desenvolvedor';
export const DEVELOPER_MODULE = 'desenvolvedor';
export const DEVELOPER_BRAND_PERMISSION = 'desenvolvedor.marca';

export const isDeveloperSlug = (slug: string) => slug.startsWith(`${DEVELOPER_MODULE}.`);

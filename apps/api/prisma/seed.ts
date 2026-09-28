import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEVELOPER_BRAND_PERMISSION, DEVELOPER_MODULE, DEVELOPER_ROLE_NAME } from '../src/common/developer';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ module: string; action: string }> = [
  { module: 'dashboard', action: 'visualizar' },
  { module: 'clientes', action: 'visualizar' },
  { module: 'clientes', action: 'editar' },
  { module: 'clientes', action: 'bloquear' },
  { module: 'motoristas', action: 'visualizar' },
  { module: 'motoristas', action: 'aprovar' },
  { module: 'motoristas', action: 'bloquear' },
  { module: 'motoristas', action: 'editar' },
  { module: 'corridas', action: 'visualizar' },
  { module: 'corridas', action: 'editar' },
  { module: 'corridas', action: 'cancelar' },
  { module: 'mapa', action: 'visualizar' },
  { module: 'financeiro', action: 'visualizar' },
  { module: 'financeiro', action: 'editar' },
  { module: 'tarifas', action: 'visualizar' },
  { module: 'tarifas', action: 'editar' },
  { module: 'zonas', action: 'visualizar' },
  { module: 'zonas', action: 'criar' },
  { module: 'zonas', action: 'editar' },
  { module: 'zonas', action: 'excluir' },
  { module: 'configuracoes', action: 'visualizar' },
  { module: 'configuracoes', action: 'editar' },
  { module: 'cupons', action: 'visualizar' },
  { module: 'cupons', action: 'editar' },
  { module: 'usuarios', action: 'visualizar' },
  { module: 'usuarios', action: 'criar' },
  { module: 'usuarios', action: 'editar' },
  { module: 'usuarios', action: 'excluir' },
  { module: 'auditoria', action: 'visualizar' },
];

const ROLE_PERMISSIONS: Record<string, string[] | 'ALL'> = {
  'Administrador Master': 'ALL',
  Operador: ['dashboard.visualizar', 'clientes.visualizar', 'motoristas.visualizar', 'corridas.visualizar', 'mapa.visualizar'],
  Financeiro: ['dashboard.visualizar', 'financeiro.visualizar', 'financeiro.editar', 'corridas.visualizar', 'clientes.visualizar', 'motoristas.visualizar'],
};

async function main() {
  const permissions = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { slug: `${p.module}.${p.action}` },
        update: {},
        create: { slug: `${p.module}.${p.action}`, module: p.module, action: p.action },
      }),
    ),
  );

  for (const [roleName, slugs] of Object.entries(ROLE_PERMISSIONS)) {
    const permissionIds =
      slugs === 'ALL' ? permissions.map((p) => p.id) : permissions.filter((p) => slugs.includes(p.slug)).map((p) => p.id);

    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, isSystem: true, description: `Cargo padrão: ${roleName}` },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }

  // Área de desenvolvedor: permissão fora da lista PERMISSIONS de propósito, senão
  // o "ALL" do Administrador Master a incluiria.
  const devPermission = await prisma.permission.upsert({
    where: { slug: DEVELOPER_BRAND_PERMISSION },
    update: {},
    create: { slug: DEVELOPER_BRAND_PERMISSION, module: DEVELOPER_MODULE, action: 'marca' },
  });
  const dashboardPermission = permissions.find((p) => p.slug === 'dashboard.visualizar')!;
  const devRole = await prisma.role.upsert({
    where: { name: DEVELOPER_ROLE_NAME },
    update: {},
    create: { name: DEVELOPER_ROLE_NAME, isSystem: true, description: 'Equipe de desenvolvimento (marca dos apps)' },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: devRole.id } });
  await prisma.rolePermission.createMany({
    data: [devPermission, dashboardPermission].map((p) => ({ roleId: devRole.id, permissionId: p.id })),
  });
  const devEmail = process.env.SEED_DEV_EMAIL ?? 'dev@central.local';
  const devPassword = process.env.SEED_DEV_PASSWORD;
  if (devPassword) {
    await prisma.adminUser.upsert({
      where: { email: devEmail },
      update: {},
      create: { name: 'Desenvolvedor', email: devEmail, passwordHash: await bcrypt.hash(devPassword, 10), roleId: devRole.id },
    });
  }

  const masterRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Administrador Master' } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@central.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'TrocarAgora!25';

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Administrador',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      roleId: masterRole.id,
    },
  });

  const existingConfig = await prisma.pricingConfiguration.findFirst({ where: { isActive: true } });
  if (!existingConfig) {
    // Valores de exemplo do briefing — totalmente editáveis depois em Tarifas.
    await prisma.pricingConfiguration.create({
      data: {
        name: 'default',
        baseFare: 8.0,
        perKm: 2.5,
        perMinute: 0.3,
        minimumFare: 8.0,
        combinationStrategy: 'HIGHEST_MULTIPLIER',
        isActive: true,
      },
    });
  }

  const DEFAULT_SCHEDULES = [
    { name: 'Horário normal', startTime: '06:00', endTime: '13:00', multiplier: 1.0, priority: 0 },
    { name: 'Tarde', startTime: '13:00', endTime: '18:00', multiplier: 1.1, priority: 0 },
    { name: 'Noite', startTime: '18:00', endTime: '00:00', multiplier: 1.2, priority: 0 },
    { name: 'Madrugada', startTime: '00:00', endTime: '06:00', multiplier: 1.4, priority: 0 },
  ];
  for (const schedule of DEFAULT_SCHEDULES) {
    const exists = await prisma.pricingSchedule.findFirst({ where: { name: schedule.name } });
    if (!exists) await prisma.pricingSchedule.create({ data: { ...schedule, daysOfWeek: [] } });
  }

  await prisma.coupon.upsert({
    where: { code: 'BEMVINDO10' },
    update: {},
    create: { code: 'BEMVINDO10', discountType: 'PERCENTAGE', discountValue: 10, maxUses: null, active: true },
  });

  console.log(`Seed concluído. Login inicial: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

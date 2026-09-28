import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEVELOPER_MODULE, DEVELOPER_ROLE_NAME, isDeveloperSlug } from '../common/developer';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const INCLUDE = { permissions: { include: { permission: true } } };

// O seed procura o Master pelo nome e ele é quem sempre tem acesso a tudo: tirar permissão
// ou renomear deixaria a operação sem ninguém capaz de administrar a Central.
const MASTER_ROLE_NAME = 'Administrador Master';

// Permissão e cargo de desenvolvedor não existem para quem usa o painel: sem isso
// o Administrador Master se daria a permissão pela tela de Cargos.
function assertNoDeveloperSlugs(slugs?: string[]) {
  if (slugs?.some(isDeveloperSlug)) throw new BadRequestException('Permissão reservada à equipe de desenvolvimento');
}

function serialize(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp: any) => rp.permission.slug),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      where: { module: { not: DEVELOPER_MODULE } },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return permissions;
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({ where: { name: { not: DEVELOPER_ROLE_NAME } }, include: INCLUDE, orderBy: { createdAt: 'asc' } });
    return roles.map(serialize);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: INCLUDE });
    if (!role || role.name === DEVELOPER_ROLE_NAME) throw new NotFoundException('Cargo não encontrado');
    return serialize(role);
  }

  async create(dto: CreateRoleDto, actorId: string) {
    assertNoDeveloperSlugs(dto.permissionSlugs);
    const exists = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('Já existe um cargo com esse nome');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: {
          create: dto.permissionSlugs.map((slug) => ({
            permission: { connect: { slug } },
          })),
        },
      },
      include: INCLUDE,
    });

    const result = serialize(role);
    await this.audit.log({ actorId, action: 'CREATE', entity: 'Role', entityId: role.id, after: result });
    return result;
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string) {
    assertNoDeveloperSlugs(dto.permissionSlugs);
    const before = await this.findOne(id);
    if (before.name === MASTER_ROLE_NAME && (dto.permissionSlugs || (dto.name && dto.name !== MASTER_ROLE_NAME))) {
      throw new BadRequestException('O cargo Administrador Master não pode ter nome ou permissões alterados');
    }

    await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });

    if (dto.permissionSlugs) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: (
          await this.prisma.permission.findMany({ where: { slug: { in: dto.permissionSlugs } } })
        ).map((p) => ({ roleId: id, permissionId: p.id })),
      });
    }

    const role = await this.findOne(id);
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'Role', entityId: id, before, after: role });
    return role;
  }

  async remove(id: string, actorId: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { users: true } });
    if (!role || role.name === DEVELOPER_ROLE_NAME) throw new NotFoundException('Cargo não encontrado');
    if (role.isSystem) throw new BadRequestException('Cargos padrão do sistema não podem ser excluídos');
    if (role.users.length > 0) throw new BadRequestException('Não é possível excluir um cargo com usuários vinculados');

    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'DELETE', entity: 'Role', entityId: id, before: { name: role.name } });
    return { success: true };
  }
}

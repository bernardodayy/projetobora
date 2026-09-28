import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEVELOPER_ROLE_NAME } from '../common/developer';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Contas do cargo Desenvolvedor não aparecem nem podem ser criadas/alteradas por aqui.
const NOT_DEVELOPER = { role: { name: { not: DEVELOPER_ROLE_NAME } } };

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertNotDeveloperRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (role?.name === DEVELOPER_ROLE_NAME) throw new BadRequestException('Cargo reservado à equipe de desenvolvimento');
  }

  findAll() {
    return this.prisma.adminUser.findMany({
      where: { deletedAt: null, ...NOT_DEVELOPER },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id, deletedAt: null, ...NOT_DEVELOPER },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async create(dto: CreateUserDto, actorId: string) {
    const exists = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('E-mail já cadastrado');
    await this.assertNotDeveloperRole(dto.roleId);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: { name: dto.name, email: dto.email, passwordHash, roleId: dto.roleId },
      select: SAFE_SELECT,
    });

    await this.audit.log({ actorId, action: 'CREATE', entity: 'AdminUser', entityId: user.id, after: user });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.findOne(id);
    if (id === actorId && dto.status === 'BLOCKED') throw new BadRequestException('Você não pode bloquear o próprio usuário');
    if (dto.roleId) await this.assertNotDeveloperRole(dto.roleId);

    const data: Record<string, unknown> = {
      name: dto.name,
      email: dto.email,
      roleId: dto.roleId,
      status: dto.status,
    };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.adminUser.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });

    await this.audit.log({ actorId, action: 'UPDATE', entity: 'AdminUser', entityId: id, before, after: user });
    return user;
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('Você não pode excluir o próprio usuário');
    const before = await this.findOne(id);
    await this.prisma.adminUser.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ actorId, action: 'DELETE', entity: 'AdminUser', entityId: id, before });
    return { success: true };
  }
}

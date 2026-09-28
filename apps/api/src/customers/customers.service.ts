import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BlockCustomerDto } from './dto/block-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Page } from '../common/pagination';

interface FindAllFilters {
  name?: string;
  cpf?: string;
  phone?: string;
  status?: 'ACTIVE' | 'BLOCKED';
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: FindAllFilters, paging: { take: number; skip: number }) {
    const where = {
      deletedAt: null,
      status: filters.status,
      name: filters.name ? { contains: filters.name, mode: 'insensitive' as const } : undefined,
      cpf: filters.cpf ? { contains: filters.cpf } : undefined,
      phone: filters.phone ? { contains: filters.phone } : undefined,
    };
    const [items, total] = await Promise.all([
      // `id` no fim: linhas com a mesma data (criadas juntas) precisam de uma ordem estável entre páginas.
      this.prisma.customer.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paging }),
      this.prisma.customer.count({ where }),
    ]);
    return new Page(items, total);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: { addresses: { orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async create(dto: CreateCustomerDto, actorId: string) {
    const exists = await this.prisma.customer.findUnique({ where: { cpf: dto.cpf } });
    if (exists) throw new BadRequestException('CPF já cadastrado');

    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.log({ actorId, action: 'CREATE', entity: 'Customer', entityId: customer.id, after: customer });
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actorId: string) {
    const before = await this.findOne(id);
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'Customer', entityId: id, before, after: customer });
    return customer;
  }

  async block(id: string, dto: BlockCustomerDto, actorId: string) {
    const before = await this.findOne(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: 'BLOCKED', blockedReason: dto.reason },
    });
    await this.audit.log({ actorId, action: 'BLOCK', entity: 'Customer', entityId: id, before, after: customer });
    return customer;
  }

  async unblock(id: string, actorId: string) {
    const before = await this.findOne(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: 'ACTIVE', blockedReason: null },
    });
    await this.audit.log({ actorId, action: 'UNBLOCK', entity: 'Customer', entityId: id, before, after: customer });
    return customer;
  }

  async addAddress(customerId: string, dto: CreateAddressDto, actorId?: string) {
    await this.findOne(customerId);
    const address = await this.prisma.customerAddress.create({ data: { ...dto, customerId } });
    await this.audit.log({ actorId, action: 'CREATE', entity: 'CustomerAddress', entityId: address.id, after: address });
    return address;
  }

  async updateAddress(customerId: string, addressId: string, dto: UpdateAddressDto, actorId?: string) {
    const before = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!before) throw new NotFoundException('Endereço não encontrado');
    const address = await this.prisma.customerAddress.update({ where: { id: addressId }, data: dto });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'CustomerAddress', entityId: addressId, before, after: address });
    return address;
  }

  async removeAddress(customerId: string, addressId: string, actorId?: string) {
    const address = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!address) throw new NotFoundException('Endereço não encontrado');
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    await this.audit.log({ actorId, action: 'DELETE', entity: 'CustomerAddress', entityId: addressId, before: address });
    return { success: true };
  }

  // Sem cadastro autônomo pelo app ainda: é o admin quem define a senha
  // inicial do cliente para ele entrar no app pela primeira vez — mesmo
  // padrão já usado para o motorista.
  async setPassword(id: string, password: string, actorId: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.customer.update({ where: { id }, data: { passwordHash } });
    await this.audit.log({ actorId, action: 'SET_PASSWORD', entity: 'Customer', entityId: id });
    return { success: true };
  }
}

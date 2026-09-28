import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePricingZoneDto } from './dto/create-zone.dto';
import { UpdatePricingZoneDto } from './dto/update-zone.dto';

function validateGeometry(shape: string, geometry: any) {
  if (shape === 'CIRCLE') {
    const center = geometry?.center;
    if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number' || typeof geometry.radiusMeters !== 'number') {
      throw new BadRequestException('Geometria de círculo inválida. Esperado { center: { lat, lng }, radiusMeters }');
    }
    return;
  }
  const points = geometry?.points;
  if (!Array.isArray(points) || points.length < 3 || points.some((p: any) => typeof p.lat !== 'number' || typeof p.lng !== 'number')) {
    throw new BadRequestException('Geometria de polígono inválida. Esperado { points: [{ lat, lng }, ...] } com ao menos 3 pontos');
  }
}

@Injectable()
export class PricingZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.pricingZone.findMany({ orderBy: { priority: 'desc' } });
  }

  async findOne(id: string) {
    const zone = await this.prisma.pricingZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona não encontrada');
    return zone;
  }

  async create(dto: CreatePricingZoneDto, actorId: string) {
    validateGeometry(dto.shape, dto.geometry);

    const zone = await this.prisma.pricingZone.create({
      data: {
        ...dto,
        geometry: dto.geometry as any,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        daysOfWeek: dto.daysOfWeek ?? [],
      },
    });

    await this.audit.log({ actorId, action: 'CREATE', entity: 'PricingZone', entityId: zone.id, after: zone });
    return zone;
  }

  async update(id: string, dto: UpdatePricingZoneDto, actorId: string) {
    const before = await this.findOne(id);
    if (dto.shape || dto.geometry) validateGeometry(dto.shape ?? before.shape, dto.geometry ?? before.geometry);

    const zone = await this.prisma.pricingZone.update({
      where: { id },
      data: {
        ...dto,
        geometry: dto.geometry as any,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    await this.audit.log({ actorId, action: 'UPDATE', entity: 'PricingZone', entityId: id, before, after: zone });
    return zone;
  }

  async remove(id: string, actorId: string) {
    const zone = await this.findOne(id);
    await this.prisma.pricingZone.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'DELETE', entity: 'PricingZone', entityId: id, before: zone });
    return { success: true };
  }
}

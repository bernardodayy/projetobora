import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { NotificationsService } from './notifications.service';
import { paging } from '../common/pagination';
import { ReplyNotificationDto } from './dto/reply-notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('dashboard.visualizar')
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('unread') unread?: string) {
    return this.notificationsService.findAll(paging(page, pageSize, 50), unread === 'true');
  }

  @Get('unread-count')
  @RequirePermissions('dashboard.visualizar')
  unreadCount() {
    return this.notificationsService.unreadCount();
  }

  @Patch('read-all')
  @RequirePermissions('dashboard.visualizar')
  markAllRead() {
    return this.notificationsService.markAllRead();
  }

  @Patch(':id/read')
  @RequirePermissions('dashboard.visualizar')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Patch(':id/reply')
  @RequirePermissions('dashboard.visualizar')
  reply(@Param('id') id: string, @Body() dto: ReplyNotificationDto) {
    return this.notificationsService.reply(id, dto.reply);
  }
}

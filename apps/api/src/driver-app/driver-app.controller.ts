import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { throttledLogin } from '../common/login-throttle';
import { DriverAuthService } from './driver-auth.service';
import { DriverAppService } from './driver-app.service';
import { DriverLoginDto } from './dto/driver-login.dto';
import { DriverRefreshDto } from './dto/driver-refresh.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { RateCustomerDto } from './dto/rate-customer.dto';
import { DriverNoteDto } from './dto/driver-note.dto';
import { DeclineRideDto } from './dto/decline-ride.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SupportMessageDto } from './dto/support-message.dto';
import { PaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateLocationDto } from '../drivers/dto/update-location.dto';
import { SendRideMessageDto } from '../rides/dto/send-ride-message.dto';
import { DriverJwtAuthGuard } from './guards/driver-jwt-auth.guard';
import { CurrentDriver } from './decorators/current-driver.decorator';
import { AuthenticatedDriver } from './driver-app.types';

@Controller('driver-app')
export class DriverAppController {
  constructor(
    private readonly driverAuth: DriverAuthService,
    private readonly driverApp: DriverAppService,
  ) {}

  @Post('auth/login')
  login(@Body() dto: DriverLoginDto, @Req() req: Request) {
    return throttledLogin(`driver|${req.ip}|${dto.cpf}`, () => this.driverAuth.login(dto.cpf, dto.password));
  }

  @Post('auth/refresh')
  refresh(@Body() dto: DriverRefreshDto) {
    return this.driverAuth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  async logout(@Body() dto: DriverRefreshDto) {
    await this.driverAuth.logout(dto.refreshToken);
    return { success: true };
  }

  @Get('me')
  @UseGuards(DriverJwtAuthGuard)
  me(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.me(driver.sub);
  }

  @Patch('availability')
  @UseGuards(DriverJwtAuthGuard)
  setAvailability(@CurrentDriver() driver: AuthenticatedDriver, @Body() dto: SetAvailabilityDto) {
    return this.driverApp.setAvailability(driver.sub, dto.availability);
  }

  @Patch('payment')
  @UseGuards(DriverJwtAuthGuard)
  updatePayment(@CurrentDriver() driver: AuthenticatedDriver, @Body() dto: PaymentSettingsDto) {
    return this.driverApp.updatePayment(driver.sub, dto);
  }

  @Post('heartbeat')
  @UseGuards(DriverJwtAuthGuard)
  heartbeat(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.heartbeat(driver.sub);
  }

  @Patch('location')
  @UseGuards(DriverJwtAuthGuard)
  updateLocation(@CurrentDriver() driver: AuthenticatedDriver, @Body() dto: UpdateLocationDto) {
    return this.driverApp.updateLocation(driver.sub, dto.lat, dto.lng);
  }

  @Get('rides/current')
  @UseGuards(DriverJwtAuthGuard)
  currentRide(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.currentRide(driver.sub);
  }

  @Get('rides')
  @UseGuards(DriverJwtAuthGuard)
  rideHistory(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.rideHistory(driver.sub);
  }

  @Get('rides/scheduled')
  @UseGuards(DriverJwtAuthGuard)
  scheduledRides(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.scheduledRides(driver.sub);
  }

  @Get('summary')
  @UseGuards(DriverJwtAuthGuard)
  summary(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.summary(driver.sub);
  }

  @Post('rides/:id/accept')
  @UseGuards(DriverJwtAuthGuard)
  acceptRide(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string) {
    return this.driverApp.acceptRide(driver.sub, id);
  }

  @Post('rides/:id/decline')
  @UseGuards(DriverJwtAuthGuard)
  declineRide(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string, @Body() dto: DeclineRideDto) {
    return this.driverApp.declineRide(driver.sub, id, dto.reason);
  }

  @Post('rides/:id/passenger-aboard')
  @UseGuards(DriverJwtAuthGuard)
  passengerAboard(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string) {
    return this.driverApp.advanceRide(driver.sub, id, 'PASSENGER_ABOARD');
  }

  @Post('rides/:id/start')
  @UseGuards(DriverJwtAuthGuard)
  start(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string) {
    return this.driverApp.advanceRide(driver.sub, id, 'IN_PROGRESS');
  }

  @Post('rides/:id/complete')
  @UseGuards(DriverJwtAuthGuard)
  complete(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string) {
    return this.driverApp.advanceRide(driver.sub, id, 'COMPLETED');
  }

  @Post('rides/:id/rate-customer')
  @UseGuards(DriverJwtAuthGuard)
  rateCustomer(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string, @Body() dto: RateCustomerDto) {
    return this.driverApp.rateCustomer(driver.sub, id, dto.rating);
  }

  @Post('rides/:id/note')
  @UseGuards(DriverJwtAuthGuard)
  sendNote(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string, @Body() dto: DriverNoteDto) {
    return this.driverApp.sendNote(driver.sub, id, dto.message);
  }

  @Get('rides/:id/messages')
  @UseGuards(DriverJwtAuthGuard)
  listRideMessages(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string) {
    return this.driverApp.listRideMessages(driver.sub, id);
  }

  @Post('rides/:id/messages')
  @UseGuards(DriverJwtAuthGuard)
  sendRideMessage(@CurrentDriver() driver: AuthenticatedDriver, @Param('id') id: string, @Body() dto: SendRideMessageDto) {
    return this.driverApp.sendRideMessage(driver.sub, id, dto.message);
  }

  @Post('change-password')
  @UseGuards(DriverJwtAuthGuard)
  changePassword(@CurrentDriver() driver: AuthenticatedDriver, @Body() dto: ChangePasswordDto) {
    return this.driverApp.changePassword(driver.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('support-message')
  @UseGuards(DriverJwtAuthGuard)
  sendSupportMessage(@CurrentDriver() driver: AuthenticatedDriver, @Body() dto: SupportMessageDto) {
    return this.driverApp.sendSupportMessage(driver.sub, dto.message);
  }

  @Get('support-messages')
  @UseGuards(DriverJwtAuthGuard)
  supportMessages(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.supportMessages(driver.sub);
  }

  @Get('blocked-customers')
  @UseGuards(DriverJwtAuthGuard)
  listBlockedCustomers(@CurrentDriver() driver: AuthenticatedDriver) {
    return this.driverApp.listBlockedCustomers(driver.sub);
  }

  @Post('blocked-customers/:customerId')
  @UseGuards(DriverJwtAuthGuard)
  blockCustomer(@CurrentDriver() driver: AuthenticatedDriver, @Param('customerId') customerId: string) {
    return this.driverApp.blockCustomer(driver.sub, customerId);
  }

  @Delete('blocked-customers/:customerId')
  @UseGuards(DriverJwtAuthGuard)
  unblockCustomer(@CurrentDriver() driver: AuthenticatedDriver, @Param('customerId') customerId: string) {
    return this.driverApp.unblockCustomer(driver.sub, customerId);
  }
}

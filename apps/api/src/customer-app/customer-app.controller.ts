import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { throttledLogin } from '../common/login-throttle';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAppService } from './customer-app.service';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerRefreshDto } from './dto/customer-refresh.dto';
import { RequestRideDto } from './dto/request-ride.dto';
import { RateDriverDto } from './dto/rate-driver.dto';
import { FarePreviewDto } from './dto/fare-preview.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SupportMessageDto } from './dto/support-message.dto';
import { AddCardDto } from './dto/add-card.dto';
import { TopUpWalletDto } from './dto/topup-wallet.dto';
import { CreateAddressDto } from '../customers/dto/create-address.dto';
import { UpdateAddressDto } from '../customers/dto/update-address.dto';
import { CancelRideDto } from '../rides/dto/cancel-ride.dto';
import { SendRideMessageDto } from '../rides/dto/send-ride-message.dto';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { AuthenticatedCustomer } from './customer-app.types';

@Controller('customer-app')
export class CustomerAppController {
  constructor(
    private readonly customerAuth: CustomerAuthService,
    private readonly customerApp: CustomerAppService,
  ) {}

  @Post('auth/login')
  login(@Body() dto: CustomerLoginDto, @Req() req: Request) {
    return throttledLogin(`customer|${req.ip}|${dto.cpf}`, () => this.customerAuth.login(dto.cpf, dto.password));
  }

  @Post('auth/refresh')
  refresh(@Body() dto: CustomerRefreshDto) {
    return this.customerAuth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  async logout(@Body() dto: CustomerRefreshDto) {
    await this.customerAuth.logout(dto.refreshToken);
    return { success: true };
  }

  @Get('me')
  @UseGuards(CustomerJwtAuthGuard)
  me(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.me(customer.sub);
  }

  @Get('addresses')
  @UseGuards(CustomerJwtAuthGuard)
  listAddresses(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.listAddresses(customer.sub);
  }

  @Post('addresses')
  @UseGuards(CustomerJwtAuthGuard)
  addAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateAddressDto) {
    return this.customerApp.addAddress(customer.sub, dto);
  }

  @Patch('addresses/:id')
  @UseGuards(CustomerJwtAuthGuard)
  updateAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.customerApp.updateAddress(customer.sub, id, dto);
  }

  @Delete('addresses/:id')
  @UseGuards(CustomerJwtAuthGuard)
  removeAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string) {
    return this.customerApp.removeAddress(customer.sub, id);
  }

  @Post('fare-preview')
  @UseGuards(CustomerJwtAuthGuard)
  previewFare(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: FarePreviewDto) {
    return this.customerApp.previewFare(dto.originLat, dto.originLng, dto.destinationLat, dto.destinationLng, dto.couponCode, customer.sub);
  }

  @Get('rides/current')
  @UseGuards(CustomerJwtAuthGuard)
  currentRide(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.currentRide(customer.sub).then((ride) => ({ ride }));
  }

  @Get('rides')
  @UseGuards(CustomerJwtAuthGuard)
  rideHistory(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.rideHistory(customer.sub);
  }

  @Post('rides')
  @UseGuards(CustomerJwtAuthGuard)
  requestRide(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: RequestRideDto) {
    return this.customerApp.requestRide(customer.sub, dto);
  }

  @Post('rides/:id/cancel')
  @UseGuards(CustomerJwtAuthGuard)
  cancelRide(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string, @Body() dto: CancelRideDto) {
    return this.customerApp.cancelRide(customer.sub, id, dto.reason);
  }

  @Post('rides/:id/rate-driver')
  @UseGuards(CustomerJwtAuthGuard)
  rateDriver(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string, @Body() dto: RateDriverDto) {
    return this.customerApp.rateDriver(customer.sub, id, dto.rating);
  }

  @Get('rides/:id/messages')
  @UseGuards(CustomerJwtAuthGuard)
  listRideMessages(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string) {
    return this.customerApp.listRideMessages(customer.sub, id);
  }

  @Post('rides/:id/messages')
  @UseGuards(CustomerJwtAuthGuard)
  sendRideMessage(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string, @Body() dto: SendRideMessageDto) {
    return this.customerApp.sendRideMessage(customer.sub, id, dto.message);
  }

  @Post('change-password')
  @UseGuards(CustomerJwtAuthGuard)
  changePassword(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: ChangePasswordDto) {
    return this.customerApp.changePassword(customer.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('support-message')
  @UseGuards(CustomerJwtAuthGuard)
  sendSupportMessage(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: SupportMessageDto) {
    return this.customerApp.sendSupportMessage(customer.sub, dto.message);
  }

  @Get('support-messages')
  @UseGuards(CustomerJwtAuthGuard)
  supportMessages(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.supportMessages(customer.sub);
  }

  @Get('favorites')
  @UseGuards(CustomerJwtAuthGuard)
  listFavoriteDrivers(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.listFavoriteDrivers(customer.sub);
  }

  @Post('favorites/:driverId')
  @UseGuards(CustomerJwtAuthGuard)
  addFavoriteDriver(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('driverId') driverId: string) {
    return this.customerApp.addFavoriteDriver(customer.sub, driverId);
  }

  @Delete('favorites/:driverId')
  @UseGuards(CustomerJwtAuthGuard)
  removeFavoriteDriver(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('driverId') driverId: string) {
    return this.customerApp.removeFavoriteDriver(customer.sub, driverId);
  }

  @Get('blocked-drivers')
  @UseGuards(CustomerJwtAuthGuard)
  listBlockedDrivers(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.listBlockedDrivers(customer.sub);
  }

  @Post('blocked-drivers/:driverId')
  @UseGuards(CustomerJwtAuthGuard)
  blockDriver(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('driverId') driverId: string) {
    return this.customerApp.blockDriver(customer.sub, driverId);
  }

  @Delete('blocked-drivers/:driverId')
  @UseGuards(CustomerJwtAuthGuard)
  unblockDriver(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('driverId') driverId: string) {
    return this.customerApp.unblockDriver(customer.sub, driverId);
  }

  @Get('wallet')
  @UseGuards(CustomerJwtAuthGuard)
  getWallet(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.getWallet(customer.sub);
  }

  @Post('wallet/topup')
  @UseGuards(CustomerJwtAuthGuard)
  topUpWallet(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: TopUpWalletDto) {
    return this.customerApp.topUpWallet(customer.sub, dto.amount);
  }

  @Get('cards')
  @UseGuards(CustomerJwtAuthGuard)
  listCards(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerApp.listCards(customer.sub);
  }

  @Post('cards')
  @UseGuards(CustomerJwtAuthGuard)
  addCard(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: AddCardDto) {
    return this.customerApp.addCard(customer.sub, dto);
  }

  @Delete('cards/:id')
  @UseGuards(CustomerJwtAuthGuard)
  removeCard(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string) {
    return this.customerApp.removeCard(customer.sub, id);
  }
}

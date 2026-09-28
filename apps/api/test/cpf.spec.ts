import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isValidCpf } from '../src/common/cpf';
import { CreateCustomerDto } from '../src/customers/dto/create-customer.dto';
import { CreateDriverDto } from '../src/drivers/dto/create-driver.dto';
import { CustomerLoginDto } from '../src/customer-app/dto/customer-login.dto';
import { DriverLoginDto } from '../src/driver-app/dto/driver-login.dto';

describe('isValidCpf', () => {
  it('accepts real CPFs (including ones whose check digit is 0)', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
    expect(isValidCpf('98765432100')).toBe(true); // 2º dígito verificador 0
  });

  it('rejects a wrong check digit', () => {
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('12345678901')).toBe(false);
  });

  it('rejects repeated digits even though they pass the arithmetic', () => {
    for (const d of '0123456789') expect(isValidCpf(d.repeat(11))).toBe(false);
  });

  it('rejects wrong length and non-digits', () => {
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529.982.247-25')).toBe(false);
    expect(isValidCpf('5299822472a')).toBe(false);
  });
});

describe('CPF in sign-up DTOs', () => {
  const customer = (cpf: string) => plainToInstance(CreateCustomerDto, { name: 'Maria Souza', cpf, phone: '11999990000' });
  const driver = (cpf: string) =>
    plainToInstance(CreateDriverDto, { name: 'Carlos Silva', cpf, phone: '11988887777', cnh: '12345678900', cnhCategory: 'B', vehicle: { plate: 'ABC1D23', model: 'Gol', brand: 'VW' } });

  it('lets a valid CPF through and stops an invalid one at customer sign-up', async () => {
    expect(await validate(customer('52998224725'))).toHaveLength(0);
    const errors = await validate(customer('12345678901'));
    expect(errors[0].constraints).toEqual({ isCpf: 'CPF inválido' });
  });

  it('does the same at driver sign-up', async () => {
    expect(await validate(driver('52998224725'))).toHaveLength(0);
    expect((await validate(driver('11111111111')))[0].constraints).toEqual({ isCpf: 'CPF inválido' });
  });

  it('does NOT apply the checksum at login, so older accounts with an unusual CPF can still sign in', async () => {
    const customerLogin = plainToInstance(CustomerLoginDto, { cpf: '12345678901', password: 'cliente123' });
    const driverLogin = plainToInstance(DriverLoginDto, { cpf: '11122233344', password: 'motorista456' });
    expect(await validate(customerLogin)).toHaveLength(0);
    expect(await validate(driverLogin)).toHaveLength(0);
  });
});

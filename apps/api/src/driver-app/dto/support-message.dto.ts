import { IsString, MaxLength, MinLength } from 'class-validator';

export class SupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;
}

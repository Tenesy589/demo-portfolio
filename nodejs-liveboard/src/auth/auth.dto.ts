import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demo@liveboard.dev' }) @IsEmail() email: string;
  @ApiProperty({ example: 'demo1234' }) @IsString() @MinLength(8) password: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Ada Lovelace' }) @IsString() @MinLength(2) @MaxLength(60) name: string;
}

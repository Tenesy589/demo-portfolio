import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Priority } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Product roadmap' }) @IsString() @MinLength(1) @MaxLength(80) title: string;
}

export class ColumnDto {
  @ApiProperty({ example: 'In review' }) @IsString() @MinLength(1) @MaxLength(40) title: string;
}

export class CreateCardDto {
  @ApiProperty() @IsString() columnId: string;
  @ApiProperty({ example: 'Ship WebSocket presence' }) @IsString() @MinLength(1) @MaxLength(140) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ enum: Priority }) @IsOptional() @IsEnum(Priority) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string | null;
}

export class UpdateCardDto extends PartialType(CreateCardDto) {
  /** Optimistic concurrency: the version the client last saw. */
  @ApiProperty() @IsInt() version: number;
}

export class MoveCardDto {
  @ApiProperty() @IsString() columnId: string;
  @ApiProperty({ description: 'Target index inside the column (0-based)' }) @IsInt() @Min(0) index: number;
}

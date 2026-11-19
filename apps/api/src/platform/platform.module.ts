import { Body, Controller, ForbiddenException, Get, Module, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsObject, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/auth.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { PrismaService } from '../prisma.service';

const sections = ['Asistente', 'Citas', 'Pacientes', 'Profesionales', 'Servicios', 'Tratamientos', 'Seguimiento', 'Horarios'];

class SectionDto {
  @IsIn(sections) id!: string;
  @IsString() @MaxLength(60) title!: string;
  @IsBoolean() visible!: boolean;
}

class BlockDto {
  @IsIn(['heading', 'text']) type!: 'heading' | 'text';
  @IsString() @MaxLength(5000) text!: string;
}

class PageDto {
  @IsString() @Matches(/^[a-z0-9-]{1,80}$/) id!: string;
  @IsString() @MaxLength(60) @Matches(/\S/) title!: string;
  @IsBoolean() visible!: boolean;
  @IsArray() @ArrayMaxSize(20) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => BlockDto) blocks!: BlockDto[];
}

class WorkspaceDto {
  @IsArray() @ArrayMaxSize(8) @ArrayUnique((item: SectionDto | null) => item?.id)
  @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => SectionDto) sections!: SectionDto[];

  @IsArray() @ArrayMaxSize(20) @ArrayUnique((item: PageDto | null) => item?.id)
  @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => PageDto) pages!: PageDto[];
}

const businessSelect = {
  id: true, name: true, businessType: true, specialty: true, workspacePages: true,
} as const;

@Controller('platform/businesses')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  private async requireAdmin(session: SessionUser) {
    const account = session.sub && await this.prisma.user.findUnique({
      where: { id: session.sub }, select: { isPlatformAdmin: true },
    });
    if (!account || !account.isPlatformAdmin) throw new ForbiddenException('Se requiere una cuenta de administración de plataforma.');
  }

  @Get()
  async list(@Req() { user }: { user: SessionUser }) {
    await this.requireAdmin(user);
    return this.prisma.clinic.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], select: businessSelect });
  }

  @Post()
  async create(@Req() { user }: { user: SessionUser }, @Body() input: RegisterDto) {
    await this.requireAdmin(user);
    const { user: owner } = await this.auth.register(input);
    return this.prisma.clinic.findUniqueOrThrow({ where: { id: owner.clinicId! }, select: businessSelect });
  }

  @Patch(':id/pages')
  async updatePages(@Req() { user }: { user: SessionUser }, @Param('id') id: string, @Body() input: WorkspaceDto) {
    await this.requireAdmin(user);
    return this.prisma.clinic.update({
      where: { id },
      data: { workspacePages: { sections: input.sections.map(({ id, title, visible }) => ({ id, title: title.trim(), visible })),
        pages: input.pages.map(({ id, title, visible, blocks }) => ({ id, title: title.trim(), visible, blocks: blocks.map(({ type, text }) => ({ type, text })) })) } },
      select: businessSelect,
    });
  }
}

@Module({ imports: [AuthModule], controllers: [PlatformController] })
export class PlatformModule {}

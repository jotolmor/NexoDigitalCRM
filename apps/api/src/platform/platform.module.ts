import { Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  private async requireAccount(session: SessionUser) {
    const account = session.sub && await this.prisma.user.findUnique({
      where: { id: session.sub }, select: { id: true, role: true, isDeveloper: true, isPlatformAdmin: true },
    });
    if (!account || (!account.isPlatformAdmin && !(account.isDeveloper && account.role === 'CLINIC_OWNER'))) {
      throw new ForbiddenException('Se requiere acceso de administración o desarrollo.');
    }
    return account;
  }

  @Get()
  async list(@Req() { user }: { user: SessionUser }) {
    const account = await this.requireAccount(user);
    const where = account.isPlatformAdmin ? undefined : { developmentBusiness: { is: { developerUserId: account.id } } };
    return this.prisma.clinic.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: businessSelect });
  }

  @Post()
  async create(@Req() { user }: { user: SessionUser }, @Body() input: RegisterDto) {
    const account = await this.requireAccount(user);
    if (!account.isPlatformAdmin) throw new ForbiddenException('Usa el alta de negocios de desarrollo.');
    const { user: owner } = await this.auth.register(input);
    return this.prisma.clinic.findUniqueOrThrow({ where: { id: owner.clinicId! }, select: businessSelect });
  }

  @Patch(':id/pages')
  async updatePages(@Req() { user }: { user: SessionUser }, @Param('id') id: string, @Body() input: WorkspaceDto) {
    const account = await this.requireAccount(user);
    const where = { id, ...(account.isPlatformAdmin ? {} : { developmentBusiness: { is: { developerUserId: account.id } } }) };
    return this.prisma.clinic.update({
      where,
      data: { workspacePages: { sections: input.sections.map(({ id, title, visible }) => ({ id, title: title.trim(), visible })),
        pages: input.pages.map(({ id, title, visible, blocks }) => ({ id, title: title.trim(), visible, blocks: blocks.map(({ type, text }) => ({ type, text })) })) } },
      select: businessSelect,
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Negocio no encontrado.');
      }
      throw error;
    });
  }
}

@Module({ imports: [AuthModule], controllers: [PlatformController] })
export class PlatformModule {}

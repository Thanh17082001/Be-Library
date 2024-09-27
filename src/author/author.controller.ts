import { AuthorService } from './author.service';
import { CreateAuthorDto } from './dto/create-author.dto';
import { UpdateAuthorDto } from './dto/update-author.dto';
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { PageOptionsDto } from 'src/utils/page-option-dto';
import { ItemDto, PageDto } from 'src/utils/page.dto';
import { ApiTags } from '@nestjs/swagger';
import { ObjectId, Types } from 'mongoose';
import { Roles } from 'src/role/role.decorator';
import { Role } from 'src/role/role.enum';
import { RolesGuard } from 'src/role/role.guard';
import { CaslGuard } from 'src/casl/casl.guard';
import { CheckPolicies } from 'src/casl/check-policies.decorator';
import { AppAbility } from 'src/casl/casl-ability.factory/casl-ability.factory';
import { Action } from 'src/casl/casl.action';
import { Request } from 'express';
import { Public } from 'src/auth/auth.decorator';
import { Author } from './entities/author.entity';


@Controller('author')
@ApiTags('author')
export class AuthorController {
  constructor(private readonly authorService: AuthorService) { }

  @Post()
  async create(@Body() createDto: CreateAuthorDto, @Req() request: Request): Promise<Author> {
    const user = request['user'] ?? null;
    return await this.authorService.create({ ...createDto });
  }

  @Get()
  // @Roles(Role.User) // tên role để chặn bên dưới
  // @UseGuards(RolesGuard) // chặn role (admin, student ,....)
  // @CheckPolicies((ability: AppAbility) => ability.can(Action.Read, 'test')) // tên permisson và bảng cần chặn
  // @UseGuards(CaslGuard) // chặn permisson (CRUD)
  // @CheckPolicies((ability: AppAbility) => ability.can(Action.Read, 'test'), (ability: AppAbility) => ability.can(Action.Read, 'Author'))
  @Public()
  async findAll(@Query() query: Partial<CreateAuthorDto>, @Query() pageOptionDto: PageOptionsDto, @Req() request: Request): Promise<PageDto<Author>> {

    const user = request['user'] ;
    query.libraryId = user?.libraryId ?? null
    return await this.authorService.findAll(pageOptionDto, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: ObjectId): Promise<ItemDto<Author>> {
    return await this.authorService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateAuthorDto): Promise<Author> {
    return await this.authorService.update(id, updateDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Author> {
    return await this.authorService.remove(id);
  }
}
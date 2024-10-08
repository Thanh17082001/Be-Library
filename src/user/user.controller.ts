import {UserService} from './user.service';
import {CreateUserDto} from './dto/create-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req, UseInterceptors, UploadedFile, BadRequestException} from '@nestjs/common';
import {PageOptionsDto} from 'src/utils/page-option-dto';
import {ItemDto, PageDto} from 'src/utils/page.dto';
import {ApiConsumes, ApiTags} from '@nestjs/swagger';
import {ObjectId, Types} from 'mongoose';
import {Roles} from 'src/role/role.decorator';
import {Role} from 'src/role/role.enum';
import {RolesGuard} from 'src/role/role.guard';
import {CaslGuard} from 'src/casl/casl.guard';
import {CheckPolicies} from 'src/casl/check-policies.decorator';
import {AppAbility} from 'src/casl/casl-ability.factory/casl-ability.factory';
import {Action} from 'src/casl/casl.action';
import {Request} from 'express';
import {Public} from 'src/auth/auth.decorator';
import {User} from './entities/user.entity';
import {FileInterceptor} from '@nestjs/platform-express';
import {multerOptions, storage} from 'src/config/multer.config';

import * as XLSX from 'xlsx';
import {ExportExcel} from './dto/import-excel.dto';
import {formatDate} from 'src/utils/format-date';
import {generateBarcode} from 'src/common/genegrate-barcode';

@Controller('user')
@ApiTags('user')
@UseGuards(RolesGuard)
@Roles(Role.Admin) // tên role để chặn bên dưới
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {storage: storage('avatar'), ...multerOptions}))
  async create(@UploadedFile() file: Express.Multer.File, @Body() createDto: CreateUserDto, @Req() request: Request): Promise<User> {
    const user = request['user'] ?? null;
    createDto.avatar = file ? `/avatar/${file.filename}` : '';
    createDto.createBy = user?._id ?? null;
    createDto.libraryId = user?.libraryId ?? null;
    createDto.groupId = user?.groupId ?? null;
    return await this.userService.create({...createDto});
  }

  @Post('import-excel')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: Express.Multer.File, @Req() request: Request, @Body() body: ExportExcel) {
    const user = request['user'] ?? null;
    const workbook = XLSX.read(file.buffer, {type: 'buffer'});
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    let users: Array<User> = [];
    let errors: Array<{row: number; error: string}> = [];
    for (let i = 0; i < data.length; i++) {
      try {
        const item = data[i];
        const valuesItem = Object.values(item);
        const createDto: CreateUserDto = {
          fullname: valuesItem[1],
          email: valuesItem[2],
          phoneNumber: valuesItem[3],
          address: valuesItem[4],
          birthday: formatDate(valuesItem[5]),
          gender: valuesItem[6],
          username: '',
          password: '',
          libraryId: user?.libraryId ?? null,
          groupId: user?.groupId ?? null,
          passwordFirst: '',
          avatar: '',
          roleId: new Types.ObjectId(),
          createBy: user?._id ?? null,
          note: '',
          barcode: '',
        };
        // console.log(createDto);
        const ressult = await this.userService.create({...createDto});
        users.push(ressult);
      } catch (error) {
        errors.push({row: i + 1, error: error.message});
      }
    }
    return {users, errors};
  }

  @Get()
  // @Roles(Role.User) // tên role để chặn bên dưới
  // @UseGuards(RolesGuard) // chặn role (admin, student ,....)
  // @CheckPolicies((ability: AppAbility) => ability.can(Action.Read, 'test')) // tên permission và bảng cần chặn
  // @UseGuards(CaslGuard) // chặn permission (CRUD)
  // @CheckPolicies((ability: AppAbility) => ability.can(Action.Read, 'test'), (ability: AppAbility) => ability.can(Action.Read, 'User'))
  // @Public()
  async findAll(@Query() query: Partial<CreateUserDto>, @Query() pageOptionDto: PageOptionsDto, @Req() request: Request): Promise<PageDto<User>> {
    const user = request['user'];
    query.libraryId = user?.libraryId ?? null;
    return await this.userService.findAll(pageOptionDto, query);
  }

  @Get('/deleted')
  async findAllDeleted(@Query() query: Partial<CreateUserDto>, @Query() pageOptionDto: PageOptionsDto, @Req() request: Request): Promise<PageDto<User>> {
    const user = request['user'];
    query.libraryId = user?.libraryId ?? null;
    return await this.userService.findDeleted(pageOptionDto, query);
  }

  @Get('deleted/:id')
  async findOneDeleted(@Param('id') id: string): Promise<ItemDto<User>> {
    return await this.userService.findByIdDeleted(new Types.ObjectId(id));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ItemDto<User>> {
    return await this.userService.findById(new Types.ObjectId(id));
  }

  @Get('barcode/:barcode')
  async findByBarcode(@Param('barcode') barcode: string): Promise<ItemDto<User>> {
    return await this.userService.findByBarcode(barcode);
  }

  @Delete('selected')
  async removes(@Body() ids: string[]): Promise<Array<User>> {
    return await this.userService.removes(ids);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }

  @Patch('restore')
  async restoreByIds(@Body('ids') ids: string[]): Promise<User[]> {
    return this.userService.restoreByIds(ids);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {storage: storage('avatar'), ...multerOptions}))
  async update(@UploadedFile() file: Express.Multer.File, @Param('id') id: string, @Body() updateDto: UpdateUserDto): Promise<User> {
    if (file) {
      updateDto.avatar = `/avatar/${file.filename}`;
    }

    return await this.userService.update(id, updateDto);
  }
}

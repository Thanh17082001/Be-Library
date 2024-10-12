import {CreateLoanshipDto} from './dto/create-loanship.dto';
import {UpdateLoanshipDto} from './dto/update-loanship.dto';
import {Injectable, NotFoundException, BadRequestException, HttpException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model, ObjectId, Types} from 'mongoose';
import {PageOptionsDto} from 'src/utils/page-option-dto';
import {ItemDto, PageDto} from 'src/utils/page.dto';
import {PageMetaDto} from 'src/utils/page.metadata.dto';
import {SoftDeleteModel} from 'mongoose-delete';
import {LoanSlip} from './entities/loanship.entity';
import {PublicationService} from 'src/publication/publication.service';
import {generateRandomData} from 'src/common/genegrate-barcode';
import {FilterDateDto} from './dto/fillter-date.dto';

@Injectable()
export class LoanshipService {
  constructor(
    @InjectModel(LoanSlip.name) private loanSlipModel: SoftDeleteModel<LoanSlip>,
    private readonly publicationService: PublicationService
  ) {}
  async create(createDto: CreateLoanshipDto): Promise<LoanSlip> {
    createDto.barcode = generateRandomData();
    const publications = [];
    for (let i = 0; i < createDto.publications.length; i++) {
      const publicationId = createDto.publications[i].publicationId;
      console.log(publicationId);
      const publication = await this.publicationService.findById(publicationId);

      publications.push({
        ...createDto.publications[i],
        ...publication,
      });
    }
    createDto.publications = publications;
    const result = await this.loanSlipModel.create({...createDto});
    return result;
  }
  async agreeToLoan(id: string): Promise<any> {
    const loan = await this.loanSlipModel.findById(new Types.ObjectId(id));
    if (loan.isAgree) {
      throw new BadRequestException('loan already agree');
    }
    if (!loan) {
      throw new NotFoundException('Resource not found');
    }
    const publications = loan.publications;
    const publicationsUpdate = [];
    const error = [];
    for (let i = 0; i < publications.length; i++) {
      const publicationId = publications[i].publicationId;
      const publication = await this.publicationService.findById(publicationId);
      let loanQuantityed = publication.shelvesQuantity - publications[i].quantityLoan;
      let data = {};
      if (publications[i].position == 'trong kho') {
        loanQuantityed = publication.quantity - publications[i].quantityLoan;
        if (loanQuantityed <= 0) {
          error.push({
            publicationId: publicationId,
            message: `Not enough quantity : ${publication.name}`,
          });
        }
        data = {quantity: loanQuantityed};
      } else {
        if (loanQuantityed < 0) {
          error.push({
            publicationId: publicationId,
            message: `Not enough quantity: ${publication.name}`,
          });
        }
        data = {shelvesQuantity: loanQuantityed};
      }
      if (error.length > 0) {
        throw new BadRequestException(error);
      }
      const updatePublication = await this.publicationService.update(publicationId.toString(), data);
      publicationsUpdate.push({
        ...publications[i],
        quantity: updatePublication.quantity,
        shelvesQuantity: updatePublication.shelvesQuantity,
      });
    }
    return await this.loanSlipModel.findByIdAndUpdate(
      new Types.ObjectId(id),
      {isAgree: true, status: 'đã duyệt', publications: publicationsUpdate},
      {
        returnDocument: 'after',
      }
    );
  }

  async returnToLoan(id: string): Promise<any> {
    const loan = await this.loanSlipModel.findById(new Types.ObjectId(id));
    if (loan.isReturn) {
      throw new BadRequestException('books already return');
    }
    if (!loan) {
      throw new NotFoundException('Resource not found');
    }
    const publications = loan.publications;
    const error = [];
    for (let i = 0; i < publications.length; i++) {
      const publicationId = publications[i].publicationId;
      const publication = await this.publicationService.findById(publicationId);
      let loanQuantityed = publication.shelvesQuantity + publications[i].quantityLoan;
      let data = {};
      if (publications[i].position == 'stock') {
        loanQuantityed = publication.quantity + publications[i].quantityLoan;
        if (loanQuantityed <= 0) {
          error.push({
            publicationId: publicationId,
            message: `Not enough quantity : ${publicationId}`,
          });
        }
        data = {quantity: loanQuantityed};
      } else {
        if (loanQuantityed <= 0) {
          error.push({
            publicationId: publicationId,
            message: `Not enough quantity: ${publicationId}`,
          });
        }
        data = {shelvesQuantity: loanQuantityed};
      }
      if (error.length > 0) {
        throw new HttpException(error, 400);
      }
      await this.publicationService.update(publicationId.toString(), data);
    }
    return await this.loanSlipModel.findByIdAndUpdate(
      new Types.ObjectId(id),
      {isReturn: true, status: 'đã trả sách'},
      {
        returnDocument: 'after',
      }
    );
  }

  async findAll(pageOptions: PageOptionsDto, query: Partial<CreateLoanshipDto>): Promise<PageDto<LoanSlip>> {
    const {page, limit, skip, order, search} = pageOptions;
    const pagination = ['page', 'limit', 'skip', 'order', 'search'];
    const mongoQuery: any = {isActive: 1};
    // Thêm các điều kiện từ `query`
    if (!!query && Object.keys(query).length > 0) {
      const arrayQuery = Object.keys(query);
      arrayQuery.forEach(key => {
        console.log(key);
        if (key && !pagination.includes(key)) {
          if (key == 'startDate' || key == 'endDate') {
            const startDate = new Date(query.startDate);
            startDate.setHours(0, 0, 0, 0); // Đặt thời gian bắt đầu của ngày

            const endDate = new Date(query.endDate);
            endDate.setHours(23, 59, 59, 999);
            mongoQuery[query.type ?? 'borrowedDay'] = {
              $gte: startDate, // Ngày bắt đầu
              $lte: endDate, // Ngày kết thúc
            };
          } else if (key !== 'type') {
            mongoQuery[key] = query[key];
          }
        }
      });
    }

    console.log(mongoQuery);

    //search document
    if (search) {
      mongoQuery.name = {$regex: new RegExp(search, 'i')};
    }

    // Thực hiện phân trang và sắp xếp
    const [results, itemCount] = await Promise.all([
      this.loanSlipModel
        .find(mongoQuery)
        // .populate('publications.publicationId')
        .populate({
          path: 'userId',
          select: ['-password', '-passwordFirst'],
        })
        .sort({order: 1, createdAt: order === 'ASC' ? 1 : -1})
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.loanSlipModel.countDocuments(mongoQuery),
    ]);

    const pageMetaDto = new PageMetaDto({
      pageOptionsDto: pageOptions,
      itemCount,
    });
    return new PageDto(results, pageMetaDto);
  }

  async filterByDate(pageOptions: PageOptionsDto, query: Partial<FilterDateDto>): Promise<PageDto<LoanSlip>> {
    const {page, limit, skip, order, search} = pageOptions;
    const pagination = ['page', 'limit', 'skip', 'order', 'search'];
    const mongoQuery: any = {
      borrowDate: {
        $gte: new Date(query.startDate.toString()), // Ngày bắt đầu
        $lte: new Date(query.endDate.toString()), // Ngày kết thúc
      },
      libraryId: query.libraryId,
      isActive: 1,
    };

    // Thực hiện phân trang và sắp xếp
    const [results, itemCount] = await Promise.all([
      this.loanSlipModel
        .find(mongoQuery)
        // .populate('publications.publicationId')
        .populate({
          path: 'userId',
          select: ['-password', '-passwordFirst'],
        })
        .sort({order: 1, createdAt: order === 'ASC' ? 1 : -1})
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.loanSlipModel.countDocuments(mongoQuery),
    ]);

    const pageMetaDto = new PageMetaDto({
      pageOptionsDto: pageOptions,
      itemCount,
    });
    return new PageDto(results, pageMetaDto);
  }

  async findOne(id: Types.ObjectId): Promise<ItemDto<LoanSlip>> {
    return new ItemDto(await this.loanSlipModel.findById(id));
  }

  async update(id: string, updateDto: UpdateLoanshipDto): Promise<LoanSlip> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    const resource: LoanSlip = await this.loanSlipModel.findById(new Types.ObjectId(id));
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    if (resource.isAgree) {
      throw new BadRequestException('Resource is agree');
    }
    if (resource.isReturn) {
      throw new BadRequestException('Resource is return');
    }
    return this.loanSlipModel.findByIdAndUpdate(id, updateDto, {
      returnDocument: 'after',
    });
  }

  async remove(id: string): Promise<LoanSlip> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    const resource: LoanSlip = await this.loanSlipModel.findById(new Types.ObjectId(id));
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    if (resource.isAgree) {
      throw new BadRequestException('Resource is agree');
    }
    if (resource.isReturn) {
      throw new BadRequestException('Resource is return');
    }
    return await this.loanSlipModel?.deleteById(new Types.ObjectId(id));
  }

  async removes(ids: string[]): Promise<Array<LoanSlip>> {
    const arrResult: LoanSlip[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = new Types.ObjectId(ids[i]);
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid id');
      }
      const resource: LoanSlip = await this.loanSlipModel.findById(id);
      if (!resource) {
        throw new NotFoundException('Resource not found');
      }
      if (resource.isAgree) {
        throw new BadRequestException('Resource is agree');
      }
      if (resource.isReturn) {
        throw new BadRequestException('Resource is return');
      }
      const result = await this.loanSlipModel.deleteById(id);
      arrResult.push(result);
    }
    return arrResult;
  }

  async findDeleted(pageOptions: PageOptionsDto, query: Partial<CreateLoanshipDto>): Promise<PageDto<LoanSlip>> {
    const {page, limit, skip, order, search} = pageOptions;
    const pagination = ['page', 'limit', 'skip', 'order', 'search'];
    const mongoQuery: any = {}; // Điều kiện để tìm các tài liệu đã bị xóa mềm

    // Thêm các điều kiện từ `query`
    if (!!query && Object.keys(query).length > 0) {
      const arrayQuery = Object.keys(query);
      arrayQuery.forEach(key => {
        if (key && !pagination.includes(key)) {
          mongoQuery[key] = query[key];
        }
      });
    }

    // Tìm kiếm tài liệu
    if (search) {
      mongoQuery.name = {$regex: new RegExp(search, 'i')};
    }

    // Thực hiện phân trang và sắp xếp
    const [results, itemCount] = await Promise.all([
      this.loanSlipModel
        .findDeleted(mongoQuery) // Sử dụng phương thức `findDeleted` từ mongoose-delete
        .populate('publications.publicationId')
        .sort({order: 1, createdAt: order === 'ASC' ? 1 : -1})
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(), // Nhớ gọi .exec() để thực hiện truy vấn
      this.loanSlipModel.countDocumentsDeleted(mongoQuery), // Đếm số lượng tài liệu đã bị xóa
    ]);

    const pageMetaDto = new PageMetaDto({
      pageOptionsDto: pageOptions,
      itemCount,
    });

    return new PageDto(results, pageMetaDto);
  }

  async findByIdDeleted(id: Types.ObjectId): Promise<ItemDto<LoanSlip>> {
    return new ItemDto(await this.loanSlipModel.findOneDeleted({_id: new Types.ObjectId(id)}));
  }

  async restoreByIds(ids: string[]): Promise<LoanSlip[]> {
    const restoredDocuments = await this.loanSlipModel.restore({_id: {$in: ids}});

    // Kiểm tra xem có tài liệu nào được khôi phục hay không
    if (!restoredDocuments || restoredDocuments.length === 0) {
      throw new NotFoundException(`No documents found for the provided IDs`);
    }
    await this.loanSlipModel.updateMany({_id: {$in: ids}}, {$set: {deleted: false}});

    return restoredDocuments;
  }

  async delete(id: string): Promise<LoanSlip> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    const resource: LoanSlip = await this.loanSlipModel.findById(new Types.ObjectId(id));
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    if (resource.isAgree) {
      throw new BadRequestException('Resource is agree');
    }
    if (resource.isReturn) {
      throw new BadRequestException('Resource is return');
    }
    return await this.loanSlipModel?.findByIdAndDelete(new Types.ObjectId(id));
  }

  async deleteMultiple(ids: string[]): Promise<any> {
    const objectIds = ids.map(id => new Types.ObjectId(id));
    return await this.loanSlipModel.deleteMany({
      _id: {$in: objectIds},
    });
  }

  async totalPublication(publicationIds: string[]): Promise<any> {
    return await this.loanSlipModel.aggregate([
      {$unwind: '$publications'}, // Tách từng phần tử trong mảng publications
      {$match: {'publications.publicationId': {$in: publicationIds}}}, // Lọc những phiếu mượn có publicationId trong danh sách
      {
        $group: {
          _id: '$publications.publicationId', // Gom nhóm theo publicationId
          totalQuantityLoan: {$sum: '$publications.quantityLoan'}, // Tính tổng quantityLoan cho từng cuốn sách
        },
      },
    ]);
  }
}
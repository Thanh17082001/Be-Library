import { ApiProperty, OmitType } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { Types } from "mongoose";
import { BaseDto } from "src/common/base.dto";

export class CreateGroupDto extends OmitType(BaseDto, ['libraryId', 'groupId']) {
   @ApiProperty()
   @IsString()
    name: string;
   @ApiProperty({ example: 'libraryId' })
   @IsString()
    mainLibrary: Types.ObjectId | null;
}
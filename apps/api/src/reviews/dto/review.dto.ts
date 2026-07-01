import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SubmitReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

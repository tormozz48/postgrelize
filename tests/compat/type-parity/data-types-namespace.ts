import { DataTypes } from '@orm';

// DataTypes.<X>DataType: the interface family reachable through the DataTypes namespace
export function scale(type: DataTypes.DecimalDataType): number | undefined {
  return type.options.scale;
}
export function precision(type: DataTypes.DecimalDataType): number | undefined {
  return type.options.precision;
}
export const decimal: DataTypes.DecimalDataType = DataTypes.DECIMAL(10, 2);
export const decimalScale = scale(DataTypes.DECIMAL(10, 2));
export const decimalPrecision = precision(DataTypes.DECIMAL(10, 2));

export const str: DataTypes.StringDataType = DataTypes.STRING(64);
export const strLength: number | undefined = str.options?.length;
export const char: DataTypes.CharDataType = DataTypes.CHAR(8);
export const text: DataTypes.TextDataType = DataTypes.TEXT('tiny');
export const textLength: DataTypes.TextDataTypeOptions['length'] = text.options.length;

export const unsigned = DataTypes.INTEGER.UNSIGNED;
export const zerofill = DataTypes.BIGINT.UNSIGNED.ZEROFILL;
export function integerOptions(type: DataTypes.IntegerDataType): DataTypes.NumberDataTypeOptions {
  return type.options;
}
export function smallOptions(
  type: DataTypes.SmallIntegerDataType | DataTypes.TinyIntegerDataType,
): DataTypes.IntegerDataTypeOptions {
  return type.options;
}
export function mediumOptions(type: DataTypes.MediumIntegerDataType): number | undefined {
  return type.options.length;
}
export function bigOptions(type: DataTypes.BigIntDataType): boolean | undefined {
  return type.options.unsigned;
}
export const numberOptions: DataTypes.NumberDataTypeOptions = decimal.options;
export function numberType(type: DataTypes.NumberDataType): DataTypes.NumberDataTypeOptions {
  return type.options;
}
export const numbered = numberType(DataTypes.DECIMAL(10, 2));

export const float: DataTypes.FloatDataType = DataTypes.FLOAT(8);
export const floatOptions: DataTypes.FloatDataTypeOptions = float.options;
export function realOptions(type: DataTypes.RealDataType): DataTypes.RealDataTypeOptions {
  return type.options;
}
export function doubleOptions(type: DataTypes.DoubleDataType): DataTypes.DoubleDataTypeOptions {
  return type.options;
}

export const date: DataTypes.DateDataType = DataTypes.DATE(3);
export function dateOnly(type: DataTypes.DateOnlyDataType): string {
  return type.key;
}
export const blob: DataTypes.BlobDataType = DataTypes.BLOB('tiny');

export const geometry: DataTypes.GeometryDataType = DataTypes.GEOMETRY('POINT', 4326);
export const geography: DataTypes.GeographyDataType = DataTypes.GEOGRAPHY('POINT', 4326);
export const geometrySrid: number | undefined = geometry.options.srid;

export const enumeration: DataTypes.EnumDataType<'a' | 'b'> = DataTypes.ENUM('a', 'b');
export const enumValues: readonly ('a' | 'b')[] = enumeration.values;
export const array: DataTypes.ArrayDataType<typeof DataTypes.STRING> = DataTypes.ARRAY(
  DataTypes.STRING,
);
export const range: DataTypes.RangeDataType<typeof DataTypes.INTEGER> = DataTypes.RANGE(
  DataTypes.INTEGER,
);
export const virtual: DataTypes.VirtualDataType<typeof DataTypes.STRING> = DataTypes.VIRTUAL(
  DataTypes.STRING,
  ['a'],
);

// every member is also an AbstractDataType
export const abstract: DataTypes.AbstractDataType[] = [decimal, str, char, text, date];
export const sql: string = decimal.toSql();

// DataTypes.X(...) / new DataTypes.X(...) forms and the UNSIGNED / ZEROFILL chain
export const integerCalled: DataTypes.IntegerDataType = DataTypes.INTEGER({ length: 11 });
export const integerNew: DataTypes.IntegerDataType = new DataTypes.INTEGER();
export const bigCalled: DataTypes.BigIntDataType = DataTypes.BIGINT({ length: 20 });
export const smallChain: DataTypes.SmallIntegerDataType = DataTypes.SMALLINT.UNSIGNED.ZEROFILL();
export const tinyNew: DataTypes.TinyIntegerDataType = new DataTypes.TINYINT.UNSIGNED();
export const mediumCalled: DataTypes.MediumIntegerDataType = DataTypes.MEDIUMINT({ length: 8 });
export const uuidCalled: DataTypes.AbstractDataType = DataTypes.UUID();
export const jsonbNew: DataTypes.AbstractDataType = new DataTypes.JSONB();
export const doubleCalled: DataTypes.DoubleDataType = DataTypes.DOUBLE(10, 2);
export const realCalled: DataTypes.RealDataType = DataTypes.REAL(10);

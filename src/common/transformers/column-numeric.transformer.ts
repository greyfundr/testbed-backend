import { ValueTransformer } from 'typeorm';

export class ColumnNumericTransformer implements ValueTransformer {
  to(data: number): number {
    return data;
  }
  from(data: string): number {
    return parseFloat(data);
  }
}

/**
 * Transformer for monetary values stored as bigint (kobo) in the database.
 * Converts to decimal (Naira) in the application.
 */
export class BigIntAmountTransformer implements ValueTransformer {
  to(value: number): number {
    // When saving, we assume the application is passing Naira
    // Converting Naira to Kobo for storage
    return value ? Math.round(value * 100) : 0;
  }

  from(value: string): number {
    // When retrieving, Postgres returns bigint as a string
    // Converting Kobo string back to Naira number
    return value ? Number(value) / 100 : 0;
  }
}

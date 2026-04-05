import { ValueTransformer } from 'typeorm';

/**
 * Transformer for numeric columns that are stored as decimal/numeric in the database.
 *
 * Database drivers (like pg) return decimal columns as strings to prevent precision loss.
 * This transformer casts those strings back to JavaScript numbers.
 *
 * This transformer is a pass-through for 'to' as we now store values directly in Naira.
 */
export class ColumnNumericTransformer implements ValueTransformer {
  to(data: number): number {
    return data;
  }

  from(data: string): number {
    // When retrieving, the driver returns decimal as a string
    return data ? parseFloat(data) : 0;
  }
}

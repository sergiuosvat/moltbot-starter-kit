import {
  Struct,
  StructType,
  FieldDefinition,
  Field,
  BytesType,
  BytesValue,
  U32Type,
  U32Value,
  BigUIntType,
  BigUIntValue,
  TokenIdentifierType,
  TokenIdentifierValue,
  U64Type,
  U64Value,
  VariadicValue,
} from '@multiversx/sdk-core';

export interface MetadataEntryInput {
  key: string;
  value: string;
}

const DID_PATTERN = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/;

/**
 * Validates a DID string against the W3C DID syntax (did:method:identifier).
 * Throws if the DID is malformed.
 */
export function assertValidDid(did: string): void {
  if (!DID_PATTERN.test(did)) {
    throw new Error(
      `Invalid DID format: "${did}". Expected did:<method>:<identifier> (e.g. did:key:z6Mk…)`,
    );
  }
}

export interface ServiceConfigInput {
  service_id: number;
  price: string;
  token: string;
  nonce: number;
}

function metadataEntryType(): StructType {
  return new StructType('MetadataEntry', [
    new FieldDefinition('key', '', new BytesType()),
    new FieldDefinition('value', '', new BytesType()),
  ]);
}

function serviceConfigType(): StructType {
  return new StructType('ServiceConfigInput', [
    new FieldDefinition('service_id', '', new U32Type()),
    new FieldDefinition('price', '', new BigUIntType()),
    new FieldDefinition('token', '', new TokenIdentifierType()),
    new FieldDefinition('nonce', '', new U64Type()),
  ]);
}

function metadataValueBuffer(value: string): Buffer {
  if (value.startsWith('0x')) {
    return Buffer.from(value.substring(2), 'hex');
  }
  return Buffer.from(value);
}

export function encodeMetadataVariadic(
  entries: MetadataEntryInput[] = [],
): VariadicValue {
  const type = metadataEntryType();
  const typed = entries.map(
    entry =>
      new Struct(type, [
        new Field(new BytesValue(Buffer.from(entry.key)), 'key'),
        new Field(new BytesValue(metadataValueBuffer(entry.value)), 'value'),
      ]),
  );
  return VariadicValue.fromItemsCounted(...typed);
}

export function encodeServiceConfigsVariadic(
  services: ServiceConfigInput[] = [],
): VariadicValue {
  const type = serviceConfigType();
  const typed = services.map(
    service =>
      new Struct(type, [
        new Field(new U32Value(service.service_id), 'service_id'),
        new Field(new BigUIntValue(service.price), 'price'),
        new Field(new TokenIdentifierValue(service.token), 'token'),
        new Field(new U64Value(service.nonce), 'nonce'),
      ]),
  );
  return VariadicValue.fromItemsCounted(...typed);
}

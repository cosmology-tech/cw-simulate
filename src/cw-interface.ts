export namespace Binary {
  export type Data = string;
}

export class Binary {
  constructor(public data: string) {}

  public static fromData(data: string): Binary {
    return new Binary(data);
  }

  public toData(): Binary.Data {
    return this.data;
  }
}

export enum ReplyOn {
  Always = 'always',
  Never = 'never',
  Success = 'success',
  Error = 'error',
}

export type CosmosMsg = any;

export namespace Attribute {
  export interface Data {
    key: string;
    value: string;
  }
}

export class Attribute {
  constructor(public key: string, public value: string) {}

  public static fromData(data: Attribute.Data): Attribute {
    return new Attribute(data.key, data.value);
  }

  public toData(): Attribute.Data {
    return {
      key: this.key,
      value: this.value,
    };
  }
}

export namespace Event {
  export interface Data {
    type: string;
    attributes: Attribute.Data[];
  }
}

export class Event {
  constructor(public type: string, public attributes: Attribute[]) {}

  public static fromData(data: Event.Data): Event {
    return new Event(
      data.type,
      data.attributes.map(a => Attribute.fromData(a))
    );
  }

  public toData(): Event.Data {
    return {
      type: this.type,
      attributes: this.attributes.map(a => a.toData()),
    };
  }
}

export class SubMsg {
  constructor(
    public id: number,
    public msg: CosmosMsg,
    public gas_limit: number | null,
    public reply_on: ReplyOn
  ) {}

  public static fromData(data: SubMsg.Data): SubMsg {
    return new SubMsg(data.id, data.msg, data.gas_limit, data.reply_on);
  }

  public toData(): SubMsg.Data {
    return {
      id: this.id,
      msg: this.msg,
      gas_limit: this.gas_limit,
      reply_on: this.reply_on,
    };
  }
}

export namespace SubMsg {
  export interface Data {
    id: number;
    msg: any;
    gas_limit: number | null;
    reply_on: ReplyOn;
  }
}

export namespace ContractResponse {
  export interface Data {
    messages: SubMsg.Data[];
    events: Event.Data[];
    attributes: Attribute.Data[];
    data: Binary.Data | null;
  }
}

export class ContractResponse {
  constructor(
    public messages: SubMsg[],
    public events: Event[],
    public attributes: Attribute[],
    public data: Binary | null
  ) {}

  public static fromData(data: ContractResponse.Data): ContractResponse {
    return new ContractResponse(
      data.messages.map(m => SubMsg.fromData(m)),
      data.events.map(e => Event.fromData(e)),
      data.attributes.map(a => Attribute.fromData(a)),
      (data.data !== null) ? Binary.fromData(data.data) : null
    );
  }
}

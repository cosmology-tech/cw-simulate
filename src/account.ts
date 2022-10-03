import { Coin } from "contract";

export class CWAccount {
  constructor(
    public address: string,
    public balances: { [denom: string]: Coin }
  ) {}
}

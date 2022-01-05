export class Lock {
    name!: string;
    oldLockId!: number;
    lockId!: string;

    constructor(init?: Partial<Lock>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}
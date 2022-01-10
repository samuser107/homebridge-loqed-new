import { filter } from 'rxjs';
import { Lock } from './models/lock.model';
import { LockState } from './models/lock-state';
import { LoqedPlatform } from './loqed.platform';
import { LoqedService } from './services/loqed.service';
import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

export class LockMechanismeAccessory {
    private lockMechanismeService: Service;
    private batteryService: Service;
    private loqedService: LoqedService;

    private lock: Lock;

    private state = {
        current: LockState.Unknown,
        target: LockState.Unknown,
        batteryPercentage: null
    };

    constructor(
        private readonly platform: LoqedPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.lock = accessory.context.device as Lock;

        this.loqedService = new LoqedService(
            this.platform.log,
            this.platform.config.apiKey!,
            this.platform.config.apiToken!,
            this.platform.config.webhookPort,
            this.lock.oldLockId,
            this.lock.lockId);

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fabian de Groot')
            .setCharacteristic(this.platform.Characteristic.Model, 'Loqed')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '12-34-56-78');

        this.lockMechanismeService = this.accessory.getService(this.platform.Service.LockMechanism) || this.accessory.addService(this.platform.Service.LockMechanism);
        this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);

        this.loqedService.getLockedState(this.lock.lockId);
        this.loqedService.lockStatus$
            .pipe(
                filter(x => x?.id === this.lock.lockId)
            )
            .subscribe(status => {
                if (!status) {
                    return;
                }

                if (this.state.current !== status.state && (status.state === LockState.Unlocked || status.state === LockState.Locked)) {
                    this.state.current = status.state;
                    this.platform.log.debug('Updating current state to', LockState[this.state.current]);
                    this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, status.state);
                }

                if (this.state.batteryPercentage !== status.battery_percentage) {
                    this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, status.battery_percentage);
                    this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, status.battery_percentage <= 20);
                }
            });

        this.lockMechanismeService.setCharacteristic(this.platform.Characteristic.Name, this.lock.name);

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockTargetState)
            .on('set', this.setLockTargetState.bind(this))
            .on('get', this.getLockTargetState.bind(this));

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockCurrentState)
            .on('get', this.getLockCurrentState.bind(this));
    }

    setLockTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        const newTargetState = value === this.platform.Characteristic.LockTargetState.UNSECURED
            ? LockState.Unlocked
            : LockState.Locked;

        if (newTargetState === this.state.target) {
            return;
        }

        this.state.target = newTargetState;

        this.platform.log.debug('Updating target state to', LockState[this.state.current]);
        this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
            this.state.target === LockState.Unlocked
                ? this.platform.Characteristic.LockTargetState.UNSECURED
                : this.platform.Characteristic.LockTargetState.SECURED
        );

        this.loqedService.toggle(this.state.target);

        // todo set current state aswell if no webhook port is configured

        callback(null);
    }

    getLockCurrentState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockCurrentState ->', LockState[this.state.target]);
        callback(null, this.state.target === LockState.Unlocked
            ? this.platform.Characteristic.LockCurrentState.UNSECURED
            : this.platform.Characteristic.LockCurrentState.SECURED
        );
    }

    getLockTargetState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockTargetState ->', LockState[this.state.target]);
        callback(null, this.state.target === LockState.Unlocked
            ? this.platform.Characteristic.LockTargetState.UNSECURED
            : this.platform.Characteristic.LockTargetState.SECURED
        );
    }
}
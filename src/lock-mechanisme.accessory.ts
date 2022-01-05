import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { Lock } from './models/lock.model';
import { LockedState } from './models/locked-state';
import { LoqedPlatform } from './loqed.platform';
import { LoqedService } from './services/loqed.service';

export class LockMechanismeAccessory {
    public lock: Lock;

    private lockMechanismeService: Service;
    private batteryService: Service;
    private state = LockedState.Unlocked;

    private loqedService: LoqedService;

    constructor(
        private readonly platform: LoqedPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.lock = accessory.context.device as Lock;

        this.loqedService = new LoqedService(this.platform.config.apiKey!, this.platform.config.apiToken!, this.lock.oldLockId, this.lock.lockId, this.platform.log);

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fabian de Groot')
            .setCharacteristic(this.platform.Characteristic.Model, 'Loqed')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '12-34-56-78');

        this.lockMechanismeService = this.accessory.getService(this.platform.Service.LockMechanism) || this.accessory.addService(this.platform.Service.LockMechanism);
        this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);

        this.loqedService.getLockedState(this.lock.lockId);
        this.loqedService.lockStatus$
            .subscribe(status => {
                this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState, status.state);
                this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockTargetState, status.state);

                this.batteryService.setCharacteristic(this.platform.Characteristic.BatteryLevel, status.battery_percentage);
                this.batteryService.setCharacteristic(this.platform.Characteristic.StatusLowBattery, status.battery_percentage <= 20);
            });

        this.lockMechanismeService.setCharacteristic(this.platform.Characteristic.Name, this.lock.name);

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockTargetState)
            .on('set', this.setLockTargetState.bind(this))
            .on('get', this.getLockTargetState.bind(this));

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockCurrentState)
            .on('get', this.getLockCurrentState.bind(this));
    }

    setLockTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.state = value === this.platform.Characteristic.LockTargetState.UNSECURED
            ? LockedState.Unlocked
            : LockedState.Locked;

        this.platform.log.debug('Updating target state to', this.state === LockedState.Unlocked ? 'Unlocked' : 'Locked');
        this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
            this.state === LockedState.Unlocked ? 0 : 1,
        );

        this.loqedService.toggle(this.state);
        this.loqedService.startPollingFor(this.state)
            .then(() => {
                this.platform.log.debug('Updating current state to', this.state === LockedState.Unlocked ? 'Unlocked' : 'Locked');
                this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
                    this.state === LockedState.Unlocked ? 0 : 1,
                );
            });

        callback(null);
    }

    getLockTargetState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockTargetState ->', this.state === LockedState.Unlocked ? 'Unlocked' : 'Locked');
        callback(null, this.state === LockedState.Unlocked ? 0 : 1);
    }

    getLockCurrentState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockCurrentState ->', this.state === LockedState.Unlocked ? 'Unlocked' : 'Locked');
        callback(null, this.state === LockedState.Unlocked ? 0 : 1);
    }
}
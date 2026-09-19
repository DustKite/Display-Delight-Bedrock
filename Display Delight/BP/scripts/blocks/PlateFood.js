var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

import { BlockPermutation, EquipmentSlot, ItemStack, ItemUseBeforeEvent, PlayerBreakBlockBeforeEvent, PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { EventAPI } from "../lib/EventAPI";
import { hasLimitedMaterials } from "../lib/EntityUtil";
import { takeEquippedItem, takeItem } from "../lib/ItemUtil";
import { EMPTY_PLATES, PLATE_RECIPES, PLATED_BLOCK_INFO } from "./PlatePlaceMap";

const breakingBlockLocks = new Set();
const platePlacedTicks = new Map();

function consumeHeldFood(player) {
    if (!hasLimitedMaterials(player)) return;
    if (typeof takeEquippedItem === "function") {
        takeEquippedItem(player, EquipmentSlot.Mainhand, 1, false);
    } else if (typeof takeItem === "function") {
        const container = player.getComponent("inventory")?.container;
        if (container) takeItem(container, player.selectedSlotIndex, 1);
    }
}

export class PlateFood {
    static interact(event) {
        const { player, block, itemStack, isFirstEvent } = event;
        if (!player || !block || isFirstEvent === false) return;

        const blockId = block.typeId;
        const heldItemId = itemStack?.typeId;

        if (!itemStack && !player.isSneaking) {
            const info = PLATED_BLOCK_INFO.get(blockId);
            if (info) {
                event.cancel = true;
                system.run(() => {
                    const { x, y, z } = block.location;
                    const dropPos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };

                    if (info.max > 1) {
                        const currentStage = Number(block.permutation.getState("displaydelight:plate_food") ?? 1);
                        if (currentStage > 1) {
                            block.setPermutation(block.permutation.withState("displaydelight:plate_food", currentStage - 1));
                            block.dimension.spawnItem(new ItemStack(info.item, 1), dropPos);
                            block.dimension.playSound("dig.cloth", block.location);
                            return;
                        }
                    }

                    const direction = block.permutation.getState("minecraft:cardinal_direction");
                    const emptyState = direction !== undefined ? { "minecraft:cardinal_direction": direction } : {};
                    block.setPermutation(BlockPermutation.resolve(info.plateType, emptyState));
                    block.dimension.spawnItem(new ItemStack(info.item, 1), dropPos);
                    block.dimension.playSound("dig.cloth", block.location);
                });
                return;
            }
        }

        if (!heldItemId) return;

        if (EMPTY_PLATES.has(blockId)) {
            const targetConfig = PLATE_RECIPES[blockId]?.[heldItemId];
            if (targetConfig) {
                platePlacedTicks.set(player.id, system.currentTick);
                event.cancel = true;
                system.run(() => {
                    const direction = block.permutation.getState("minecraft:cardinal_direction");
                    const stateObj = {};
                    if (direction !== undefined) {
                        stateObj["minecraft:cardinal_direction"] = direction;
                    }
                    if (targetConfig.max > 1) {
                        stateObj["displaydelight:plate_food"] = 1;
                    }

                    block.setPermutation(BlockPermutation.resolve(targetConfig.block, stateObj));
                    block.dimension.playSound("dig.cloth", block.location);
                    consumeHeldFood(player);
                });
                return;
            }
        }

        const platedInfo = PLATED_BLOCK_INFO.get(blockId);
        if (platedInfo && heldItemId === platedInfo.item && platedInfo.max > 1) {
            const currentStage = Number(block.permutation.getState("displaydelight:plate_food") ?? 1);
            if (currentStage < platedInfo.max) {
                platePlacedTicks.set(player.id, system.currentTick);
                event.cancel = true;
                system.run(() => {
                    block.setPermutation(block.permutation.withState("displaydelight:plate_food", currentStage + 1));
                    block.dimension.playSound("dig.cloth", block.location);
                    consumeHeldFood(player);
                });
                return;
            }
        }
    }

    static onItemUse(event) {
        const { source: player, itemStack } = event;
        if (!player || !itemStack) return;
        const placedTick = platePlacedTicks.get(player.id);
        if (placedTick !== undefined) {
            if (placedTick === system.currentTick) {
                event.cancel = true;
                return;
            }
            platePlacedTicks.delete(player.id);
        }
    }

    static breakBlock(event) {
        const { block, player, dimension } = event;
        if (!block) return;

        const blockId = block.typeId;
        const info = PLATED_BLOCK_INFO.get(blockId);
        const isEmptyPlate = EMPTY_PLATES.has(blockId);

        if (!info && !isEmptyPlate) return;

        const { x, y, z } = block.location;
        const posKey = `${dimension.id}:${x},${y},${z}`;
        if (breakingBlockLocks.has(posKey)) {
            event.cancel = true;
            return;
        }

        breakingBlockLocks.add(posKey);
        event.cancel = true;

        const stageCount = info ? (info.max > 1 ? Number(block.permutation.getState("displaydelight:plate_food") ?? 1) : 1) : 0;
        const isSurvival = hasLimitedMaterials(player);
        const blockLoc = { x, y, z };
        const dropPos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };

        system.run(() => {
            try {
                dimension.setBlockType(blockLoc, "minecraft:air");

                if (isSurvival) {
                    if (info) {
                        dimension.spawnItem(new ItemStack(info.item, stageCount), dropPos);
                        dimension.spawnItem(new ItemStack(info.plateType, 1), dropPos);
                    } else if (isEmptyPlate) {
                        dimension.spawnItem(new ItemStack(blockId, 1), dropPos);
                    }
                }
            } finally {
                breakingBlockLocks.delete(posKey);
            }
        });
    }
}

__decorate([
    EventAPI.register(world.beforeEvents.playerInteractWithBlock),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PlayerInteractWithBlockBeforeEvent]),
    __metadata("design:returntype", void 0)
], PlateFood, "interact", null);

__decorate([
    EventAPI.register(world.beforeEvents.itemUse),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ItemUseBeforeEvent]),
    __metadata("design:returntype", void 0)
], PlateFood, "onItemUse", null);

__decorate([
    EventAPI.register(world.beforeEvents.playerBreakBlock),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PlayerBreakBlockBeforeEvent]),
    __metadata("design:returntype", void 0)
], PlateFood, "breakBlock", null);
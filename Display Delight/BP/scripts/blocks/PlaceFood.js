var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BlockPermutation, Direction, EquipmentSlot, ItemStack, ItemUseBeforeEvent, PlayerBreakBlockBeforeEvent, PlayerInteractWithBlockBeforeEvent, system, world } from "@minecraft/server";
import { EventAPI } from "../lib/EventAPI";
import { offsetByDirection } from "../lib/DirectionUtil";
import { takeEquippedItem } from "../lib/ItemUtil";
import { hasLimitedMaterials } from "../lib/EntityUtil";
import { FOOD_PLACE_MAP } from "./FoodPlaceMap";

const BLOCK_TO_FOOD_MAP = Object.fromEntries(
    Object.entries(FOOD_PLACE_MAP).map(([itemId, blockId]) => [blockId, itemId])
);
const CARDINAL_DIRECTIONS = ["south", "west", "north", "east"];
const REPLACEABLE_BLOCKS = new Set([
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:snow_layer",
    "minecraft:nether_sprouts",
    "minecraft:crimson_roots",
    "minecraft:warped_roots"
]);
const foodPlacedTicks = new Map();
const breakingBlockLocks = new Set();

function isReplaceable(block) {
    if (!block) return false;
    return block.isAir || REPLACEABLE_BLOCKS.has(block.typeId);
}

export class PlaceFood {
    static place(event) {
        const player = event.player;
        if (!player || !event.isFirstEvent)
            return;

        const stack = event.itemStack;
        if (!stack)
            return;

        const targetBlockId = FOOD_PLACE_MAP[stack.typeId];
        if (!targetBlockId)
            return;

        const block = event.block;
        if (!block || block.typeId === "farmersdelight:cutting_board")
            return;

        const face = event.blockFace;
        let targetBlock;
        let pos;

        if (isReplaceable(block)) {
            targetBlock = block;
            pos = { x: block.x, y: block.y, z: block.z };
        } else {
            if (face !== Direction.Up)
                return;
            pos = offsetByDirection(face, { x: block.x, y: block.y, z: block.z });
            targetBlock = block.dimension.getBlock(pos);
        }

        if (!targetBlock || !isReplaceable(targetBlock))
            return;

        const belowBlock = block.dimension.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
        if (!belowBlock || belowBlock.isAir || isReplaceable(belowBlock) || belowBlock.typeId === "farmersdelight:cutting_board")
            return;

        if (!player.isSneaking) {
            system.run(() => {
                player.onScreenDisplay.setActionBar({ translate: 'item.displaydelight.tooltip.displayable' });
            });
            return;
        }

        const yRot = ((player.getRotation().y % 360) + 360) % 360;
        const cardinalDirection = CARDINAL_DIRECTIONS[Math.floor(((yRot + 45) % 360) / 90)];

        foodPlacedTicks.set(player.id, system.currentTick);
        event.cancel = true;

        const dimension = block.dimension;
        system.run(() => {
            const currentBlock = dimension.getBlock(pos);
            if (!currentBlock) return;
            currentBlock.setPermutation(BlockPermutation.resolve(targetBlockId, {
                "minecraft:cardinal_direction": cardinalDirection,
            }));
            dimension.playSound("dig.cloth", pos);
            if (hasLimitedMaterials(player)) {
                takeEquippedItem(player, EquipmentSlot.Mainhand, 1, false);
            }
        });
    }

    static onItemUse(event) {
        const { source: player, itemStack } = event;
        if (!player || !itemStack) return;

        if (FOOD_PLACE_MAP[itemStack.typeId]) {
            const placedTick = foodPlacedTicks.get(player.id);
            if (placedTick !== undefined) {
                if (placedTick === system.currentTick) {
                    event.cancel = true;
                    return;
                }
                foodPlacedTicks.delete(player.id);
            }
            if (player.isSneaking) {
                event.cancel = true;
            }
        }
    }

    static breakBlock(event) {
        const { block, player, dimension } = event;
        if (!block)
            return;

        const dropItemId = BLOCK_TO_FOOD_MAP[block.typeId];
        if (!dropItemId)
            return;

        const { x, y, z } = block.location;
        const posKey = `${dimension.id}:${x},${y},${z}`;
        if (breakingBlockLocks.has(posKey)) {
            event.cancel = true;
            return;
        }

        breakingBlockLocks.add(posKey);
        event.cancel = true;

        const blockLoc = { x, y, z };
        const dropPos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
        const isSurvival = hasLimitedMaterials(player);

        system.run(() => {
            try {
                dimension.setBlockType(blockLoc, "minecraft:air");
                if (isSurvival) {
                    dimension.spawnItem(new ItemStack(dropItemId, 1), dropPos);
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
], PlaceFood, "place", null);

__decorate([
    EventAPI.register(world.beforeEvents.itemUse),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ItemUseBeforeEvent]),
    __metadata("design:returntype", void 0)
], PlaceFood, "onItemUse", null);

__decorate([
    EventAPI.register(world.beforeEvents.playerBreakBlock),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PlayerBreakBlockBeforeEvent]),
    __metadata("design:returntype", void 0)
], PlaceFood, "breakBlock", null);
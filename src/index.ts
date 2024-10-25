/**
 * @file Repurposed and rewritten version inspired by the original work of "dfernandez79": Diego Fernandez.
 * For more information about the ASE format see: http://www.selapa.net/swatches/colors/fileformats.php#adobe_ase
 * @copyright Freedom of use.
 */

/**
 * Represents the type of a color.
 */
export type ColorType = "global" | "spot" | "normal";

/**
 * Represents an RGB color.
 */
export interface RGBColor {
	model: "RGB";
	r: number;
	g: number;
	b: number;
	hex: string;
	type: ColorType;
}

/**
 * Represents a CMYK color.
 */
export interface CMYKColor {
	model: "CMYK";
	c: number;
	m: number;
	y: number;
	k: number;
	type: ColorType;
}

/**
 * Represents a grayscale color.
 */
export interface GrayColor {
	model: "Gray";
	gray: number;
	hex: string;
	type: ColorType;
}

/**
 * Represents a LAB color.
 */
export interface LABColor {
	model: "LAB";
	lightness: number;
	a: number;
	b: number;
	type: ColorType;
}

/**
 * Represents a color that can be RGB, CMYK, Gray, or LAB.
 */
export type Color = RGBColor | CMYKColor | GrayColor | LABColor;

/**
 * Represents a color entry that contains a name and a color of type Color.
 */
export interface ColorEntry {
	type: "color";
	name: string;
	color: Color;
}

/**
 * Represents a group entry.
 */
export interface GroupEntry {
	type: "group";
	name: string;
	entries: Array<Entry>;
}

/**
 * Represents a group end entry.
 */
export interface GroupEndEntry {
	type: "group-end";
}

/**
 * Represents an entry that can be a color, group, or group end.
 */
export type Entry = ColorEntry | GroupEntry | GroupEndEntry;

/**
 * Reads an ASE file and returns the colors/groups.
 * Supports only version 1.0 of the ASE format.
 * @method read - Reads the ASE file from the given array buffer and returns the entries.
 * @method write - Writes an ASE file from the given entries and returns the array buffer.
 */
export class AseReader {
	private readonly ASE_SIGNATURE = 0x41534546;
	private readonly ASE_SUPPORTED_VERSION = "1.0";
	private readonly ASE_BLOCK_TYPE_COLOR = 0x1;
	private readonly ASE_BLOCK_TYPE_GROUP_START = 0xc001;
	private readonly ASE_BLOCK_TYPE_GROUP_END = 0xc002;
	private readonly ASE_COLOR_TYPES = ["global", "spot", "normal"] as const;

	/**
	 * Reads an ASE file and returns the colors/groups.
	 * @returns An array of colors/groups.
	 */
	public read(arrayBuffer: ArrayBuffer): Array<Entry> {
		const dataView = new DataView(arrayBuffer);
		const signature = dataView.getUint32(0, false);

		if (signature !== this.ASE_SIGNATURE) {
			console.error("Invalid file signature: ASEF header expected");
			return [];
		}

		const majorVersionNumber = dataView.getUint16(4, false);
		const minorVersionNumber = dataView.getUint16(6, false);
		const version = `${majorVersionNumber}.${minorVersionNumber}`;

		if (version !== this.ASE_SUPPORTED_VERSION) {
			console.error(
				`Only version ${this.ASE_SUPPORTED_VERSION} of the ASE format is supported`
			);
			return [];
		}

		try {
			const rawEntries = this._readEntries(dataView, 12);
			const entries = rawEntries.reduce(
				(accumulatedEntries: Array<Entry>, entry: Entry) => {
					const lastEntry = accumulatedEntries[accumulatedEntries.length - 1];

					if (lastEntry?.type === "group") {
						if (entry.type !== "group-end") {
							lastEntry.entries.push(entry);
						}
					} else {
						accumulatedEntries.push(entry);
					}

					return accumulatedEntries;
				},
				[]
			);

			return entries;
		} catch (error) {
			console.error(error);
			return [];
		}
	}

	/**
	 * Reads a UTF-16BE string from the given DataView at the specified offset and length.
	 * @param offset - The offset in the DataView where the string starts.
	 * @param length - The length of the string in characters.
	 * @returns The decoded UTF-16BE string.
	 */
	protected _readUTF16BE(
		dataView: DataView,
		offset: number,
		length: number
	): string {
		const bytes = new Uint8Array(dataView.buffer, offset, (length - 1) * 2);
		const decoder = new TextDecoder("utf-16be");
		const decoded = decoder.decode(bytes);

		return decoded;
	}

	/**
	 * Reads the entries from the given DataView starting at the specified offset.
	 * @param offset - The offset in the DataView where the entries start.
	 * @returns An array of entries.
	 */
	protected _readEntries(dataView: DataView, offset: number): Array<Entry> {
		const numberOfEntries = dataView.getUint32(8, false);

		let currentOffset: number = offset;

		const entries: Array<Entry> = Array.from({ length: numberOfEntries }).map(
			() => {
				const type = dataView.getUint16(currentOffset, false);
				const blockLength = dataView.getUint32(currentOffset + 2, false);

				let entry: Entry;

				switch (type) {
					case this.ASE_BLOCK_TYPE_COLOR:
						entry = this._readColor(dataView, currentOffset + 6);
						break;

					case this.ASE_BLOCK_TYPE_GROUP_START:
						entry = this._readGroup(dataView, currentOffset + 6);
						break;

					case this.ASE_BLOCK_TYPE_GROUP_END:
						entry = this._readGroupEnd();
						break;

					default:
						throw new Error(
							`Unsupported type ${type.toString(16)} at offset ${currentOffset}`
						);
				}

				const length = 6 + blockLength;
				currentOffset += length;

				return entry;
			}
		);

		return entries;
	}

	/**
	 * Reads a color entry from the given DataView at the specified offset.
	 * @param offset - The offset in the DataView where the color entry starts.
	 * @returns A ColorEntry object.
	 */
	protected _readColor(dataView: DataView, offset: number): ColorEntry {
		const nameLength = dataView.getUint16(offset, false);
		const colorOffset = offset + 2 + nameLength * 2;
		const name = this._readUTF16BE(dataView, offset + 2, nameLength);

		const rgbToHex = (r: number, g: number, b: number) =>
			[r, g, b].reduce(
				(hex, value) =>
					hex +
					Math.floor(value * 255)
						.toString(16)
						.toUpperCase()
						.padStart(2, "0"),
				""
			);

		const model = new TextDecoder("utf-8")
			.decode(new Uint8Array(dataView.buffer, colorOffset, 4))
			.trim() as Color["model"];

		switch (model) {
			case "RGB": {
				const r = dataView.getFloat32(colorOffset + 4, false);
				const g = dataView.getFloat32(colorOffset + 8, false);
				const b = dataView.getFloat32(colorOffset + 12, false);
				const hex = rgbToHex(r, g, b);
				const colorTypeIndex = dataView.getUint16(colorOffset + 16, false);
				const type = this.ASE_COLOR_TYPES[colorTypeIndex];
				const color: RGBColor = { model, r, g, b, hex, type };
				const entry: ColorEntry = { type: "color", name, color };

				return entry;
			}

			case "CMYK": {
				const c = dataView.getFloat32(colorOffset + 4, false);
				const m = dataView.getFloat32(colorOffset + 8, false);
				const y = dataView.getFloat32(colorOffset + 12, false);
				const k = dataView.getFloat32(colorOffset + 16, false);
				const colorTypeIndex = dataView.getUint16(colorOffset + 20, false);
				const type = this.ASE_COLOR_TYPES[colorTypeIndex];
				const color: CMYKColor = { model, c, m, y, k, type };
				const entry: ColorEntry = { type: "color", name, color };

				return entry;
			}

			case "Gray": {
				const gray = dataView.getFloat32(colorOffset + 4, false);
				const hex = rgbToHex(gray, gray, gray);
				const colorTypeIndex = dataView.getUint16(colorOffset + 8, false);
				const type = this.ASE_COLOR_TYPES[colorTypeIndex];
				const color: GrayColor = { model, gray, hex, type };
				const entry: ColorEntry = { type: "color", name, color };

				return entry;
			}

			case "LAB": {
				const lightness = dataView.getFloat32(colorOffset + 4, false);
				const a = dataView.getFloat32(colorOffset + 8, false);
				const b = dataView.getFloat32(colorOffset + 12, false);
				const colorTypeIndex = dataView.getUint16(colorOffset + 16, false);
				const type = this.ASE_COLOR_TYPES[colorTypeIndex];
				const color: LABColor = { model, lightness, a, b, type };
				const entry: ColorEntry = { type: "color", name, color };

				return entry;
			}

			default: {
				throw new Error(
					`Unsupported color model: ${model} at offset ${colorOffset}`
				);
			}
		}
	}

	/**
	 * Reads a group start from the given DataView at the specified offset.
	 * @param offset - The offset in the DataView where the group start starts.
	 * @returns A Group object.
	 */
	protected _readGroup(dataView: DataView, offset: number): GroupEntry {
		const type = "group";
		const nameLength = dataView.getUint16(offset, false);
		const name = this._readUTF16BE(dataView, offset + 2, nameLength);
		const entries: Array<Entry> = [];

		const group: GroupEntry = { type, name, entries };

		return group;
	}

	/**
	 * Reads a group end from the given DataView at the specified offset.
	 * @returns A GroupEnd object.
	 */
	protected _readGroupEnd(): GroupEndEntry {
		const type = "group-end";
		const groupEnd: GroupEndEntry = { type };

		return groupEnd;
	}

	/**
	 * Writes an ASE file from the given entries.
	 * @param entries - The entries to write to the ASE file.
	 * @returns An array buffer of the ASE file.
	 */
	public write(entries: Array<Entry>): ArrayBuffer {
		const headerSize = 12;
		const entriesSize = this._calculateTotalSize(entries);
		const totalSize = headerSize + entriesSize;

		const buffer = new ArrayBuffer(totalSize);
		const dataView = new DataView(buffer);

		this._writeHeader(dataView, entries);
		this._writeEntries(dataView, entries, headerSize);

		return buffer;
	}

	/**
	 * Writes the header of the ASE file.
	 * @param dataView - The DataView to write to.
	 * @param entries - The entries to write to the ASE file.
	 */
	private _writeHeader(dataView: DataView, entries: Array<Entry>): void {
		dataView.setUint32(0, this.ASE_SIGNATURE, false);
		dataView.setUint16(4, 1, false);
		dataView.setUint16(6, 0, false);
		dataView.setUint32(8, this._countBlocks(entries), false);
	}

	/**
	 * Writes the entries of the ASE file.
	 * @param dataView - The DataView to write to.
	 * @param entries - The entries to write to the ASE file.
	 * @param offset - The offset in the DataView where the entries start.
	 * @returns The offset after the last entry.
	 */
	private _writeEntries(
		dataView: DataView,
		entries: Array<Entry>,
		offset: number
	): number {
		let currentOffset = offset;

		for (const entry of entries) {
			currentOffset = this._writeEntry(dataView, entry, currentOffset);
		}

		return currentOffset;
	}

	/**
	 * Writes an entry to the given DataView at the specified offset.
	 * @param dataView - The DataView to write to.
	 * @param entry - The entry to write to the ASE file.
	 * @param offset - The offset in the DataView where the entry starts.
	 * @returns The offset after the last entry.
	 */
	private _writeEntry(
		dataView: DataView,
		entry: Entry,
		offset: number
	): number {
		switch (entry.type) {
			case "color":
				return this._writeColor(dataView, entry, offset);
			case "group":
				return this._writeGroup(dataView, entry, offset);
			case "group-end":
				return this._writeGroupEnd(dataView, offset);
		}
	}

	/**
	 * Writes a color entry to the given DataView at the specified offset.
	 * @param dataView - The DataView to write to.
	 * @param entry - The entry to write to the ASE file.
	 * @param offset - The offset in the DataView where the entry starts.
	 * @returns The offset after the last entry.
	 */
	private _writeColor(
		dataView: DataView,
		entry: ColorEntry,
		offset: number
	): number {
		const { name, color } = entry;
		const nameBuffer = new TextEncoder().encode(name);
		const colorDataSize = this._getColorDataSize(color);
		const blockLength = 2 + (nameBuffer.length + 1) * 2 + colorDataSize;

		dataView.setUint16(offset, this.ASE_BLOCK_TYPE_COLOR, false);
		dataView.setUint32(offset + 2, blockLength, false);
		dataView.setUint16(offset + 6, nameBuffer.length + 1, false);

		// Write name (double-byte characters)
		let currentOffset = offset + 8;
		for (let i = 0; i < nameBuffer.length; i++) {
			dataView.setUint16(currentOffset, nameBuffer[i], false);
			currentOffset += 2;
		}
		dataView.setUint16(currentOffset, 0, false); // Null terminator
		currentOffset += 2;

		// Write color data
		this._writeColorData(dataView, color, currentOffset);

		const newOffset = offset + 6 + blockLength;

		return newOffset;
	}

	/**
	 * Writes a group entry to the given DataView at the specified offset.
	 * @param dataView - The DataView to write to.
	 * @param entry - The entry to write to the ASE file.
	 * @param offset - The offset in the DataView where the entry starts.
	 * @returns The offset after the last entry.
	 */
	private _writeGroup(
		dataView: DataView,
		entry: GroupEntry,
		offset: number
	): number {
		const { name, entries } = entry;
		const nameBuffer = new TextEncoder().encode(name);
		const blockLength = 2 + (nameBuffer.length + 1) * 2;

		dataView.setUint16(offset, this.ASE_BLOCK_TYPE_GROUP_START, false);
		dataView.setUint32(offset + 2, blockLength, false);
		dataView.setUint16(offset + 6, nameBuffer.length + 1, false);

		// Write name (double-byte characters)
		for (let i = 0; i < nameBuffer.length; i++) {
			dataView.setUint16(offset + 8 + i * 2, nameBuffer[i], false);
		}
		dataView.setUint16(offset + 8 + nameBuffer.length * 2, 0, false); // Null terminator

		const newOffset = this._writeEntries(
			dataView,
			entries,
			offset + 6 + blockLength
		);

		return this._writeGroupEnd(dataView, newOffset);
	}

	/**
	 * Writes a group end entry to the given DataView at the specified offset.
	 * @param dataView - The DataView to write to.
	 * @param offset - The offset in the DataView where the entry starts.
	 * @returns The offset after the last entry.
	 */
	private _writeGroupEnd(dataView: DataView, offset: number): number {
		dataView.setUint16(offset, this.ASE_BLOCK_TYPE_GROUP_END, false);
		dataView.setUint32(offset + 2, 0, false);

		const groupEndSize = 6;
		const newOffset = offset + groupEndSize;

		return newOffset;
	}

	/**
	 * Calculates the size of the color data.
	 * @param color - The color to calculate the size for.
	 * @returns The size of the color data.
	 */
	private _getColorDataSize(color: Color): number {
		switch (color.model) {
			case "RGB":
			case "LAB":
				return 4 + 4 * 3 + 2;
			case "CMYK":
				return 4 + 4 * 4 + 2;
			case "Gray":
				return 4 + 4 + 2;
		}
	}

	/**
	 * Writes the color data to the given DataView at the specified offset.
	 * @param dataView - The DataView to write to.
	 * @param color - The color to write to the ASE file.
	 * @param offset - The offset in the DataView where the color data starts.
	 */
	private _writeColorData(
		dataView: DataView,
		color: Color,
		offset: number
	): void {
		const encoder = new TextEncoder();
		const modelBuffer = encoder.encode(color.model.padEnd(4, " "));
		for (let i = 0; i < 4; i++) {
			dataView.setUint8(offset + i, modelBuffer[i]);
		}

		let currentOffset = offset + 4;

		switch (color.model) {
			case "RGB":
				dataView.setFloat32(currentOffset, color.r, false);
				dataView.setFloat32(currentOffset + 4, color.g, false);
				dataView.setFloat32(currentOffset + 8, color.b, false);
				currentOffset += 12;
				break;
			case "CMYK":
				dataView.setFloat32(currentOffset, color.c, false);
				dataView.setFloat32(currentOffset + 4, color.m, false);
				dataView.setFloat32(currentOffset + 8, color.y, false);
				dataView.setFloat32(currentOffset + 12, color.k, false);
				currentOffset += 16;
				break;
			case "Gray":
				dataView.setFloat32(currentOffset, color.gray, false);
				currentOffset += 4;
				break;
			case "LAB":
				dataView.setFloat32(currentOffset, color.lightness, false);
				dataView.setFloat32(currentOffset + 4, color.a, false);
				dataView.setFloat32(currentOffset + 8, color.b, false);
				currentOffset += 12;
				break;
		}

		const colorTypeIndex = this.ASE_COLOR_TYPES.indexOf(color.type);
		dataView.setUint16(currentOffset, colorTypeIndex, false);
	}

	/**
	 * Calculates the total size of the ASE file.
	 * @param entries - The entries to calculate the size for.
	 * @returns The total size of the ASE file.
	 */
	private _calculateTotalSize(entries: Array<Entry>): number {
		const totalSize = entries.reduce((size, entry) => {
			switch (entry.type) {
				case "color":
					return size + this._calculateColorSize(entry);
				case "group":
					return size + this._calculateGroupSize(entry);
				case "group-end":
					return size + 6;
			}
		}, 0);

		return totalSize;
	}

	/**
	 * Calculates the size of a color entry.
	 * @param entry - The entry to calculate the size for.
	 * @returns The size of the color entry.
	 */
	private _calculateColorSize(entry: ColorEntry): number {
		const nameBuffer = new TextEncoder().encode(entry.name);
		const colorDataSize = this._getColorDataSize(entry.color);
		const colorSize = 6 + 2 + (nameBuffer.length + 1) * 2 + colorDataSize;

		return colorSize;
	}

	/**
	 * Calculates the size of a group entry.
	 * @param entry - The entry to calculate the size for.
	 * @returns The size of the group entry.
	 */
	private _calculateGroupSize(entry: GroupEntry): number {
		const nameBuffer = new TextEncoder().encode(entry.name);
		const groupSize = 6 + 2 + nameBuffer.length * 2;
		const entriesSize = this._calculateTotalSize(entry.entries);
		const groupEndSize = 6;

		return groupSize + entriesSize + groupEndSize;
	}

	/**
	 * Counts the number of blocks in the ASE file.
	 * @param entries - The entries to count the blocks for.
	 * @returns The number of blocks in the ASE file.
	 */
	private _countBlocks(entries: Array<Entry>): number {
		const blockCount = entries.reduce((count, entry) => {
			if (entry.type === "group") {
				return count + this._countBlocks(entry.entries) + 2; // +2 for group start and end
			}
			return count + 1;
		}, 0);

		return blockCount;
	}
}

/**
 * @file Repurposed and rewritten version inspired by the original work of "dfernandez79": Diego Fernandez.
 * For more information about the ASE format see: http://www.selapa.net/swatches/colors/fileformats.php#adobe_ase
 * @copyright Freedom of use.
 */

export type ColorType = "global" | "spot" | "normal";

export interface RGBColor {
	model: "RGB";
	r: number;
	g: number;
	b: number;
	hex: string;
	type: ColorType;
}

export interface CMYKColor {
	model: "CMYK";
	c: number;
	m: number;
	y: number;
	k: number;
	type: ColorType;
}

export interface GrayColor {
	model: "Gray";
	gray: number;
	hex: string;
	type: ColorType;
}

export interface LABColor {
	model: "LAB";
	lightness: number;
	a: number;
	b: number;
	type: ColorType;
}

export type Color = RGBColor | CMYKColor | GrayColor | LABColor;

export interface ColorEntry {
	type: "color";
	name: string;
	color: Color;
}

export interface GroupEntry {
	type: "group";
	name: string;
	entries: Array<Entry>;
}

export interface GroupEndEntry {
	type: "group-end";
}

export type Entry = ColorEntry | GroupEntry | GroupEndEntry;

/**
 * Reads an ASE file and returns the colors/groups.
 * Supports only version 1.0 of the ASE format.
 * @param arrayBuffer - The array buffer of the ASE file.
 * @method read - Reads the ASE file and returns the colors/groups.
 */
export class AseReader {
	private readonly ASE_SIGNATURE = 0x41534546;
	private readonly ASE_SUPPORTED_VERSION = "1.0";
	private readonly ASE_BLOCK_TYPE_COLOR = 0x1;
	private readonly ASE_BLOCK_TYPE_GROUP_START = 0xc001;
	private readonly ASE_BLOCK_TYPE_GROUP_END = 0xc002;
	private readonly ASE_COLOR_TYPES = ["global", "spot", "normal"] as const;

	private _dataView: DataView;

	constructor(arrayBuffer: ArrayBuffer) {
		this._dataView = new DataView(arrayBuffer);
	}

	/**
	 * Reads a UTF-16BE string from the given DataView at the specified offset and length.
	 * @param offset - The offset in the DataView where the string starts.
	 * @param length - The length of the string in characters.
	 * @returns The decoded UTF-16BE string.
	 */
	protected _readUTF16BE(offset: number, length: number): string {
		const bytes = new Uint8Array(
			this._dataView.buffer,
			offset,
			(length - 1) * 2
		);
		const decoder = new TextDecoder("utf-16be");
		const decoded = decoder.decode(bytes);

		return decoded;
	}

	/**
	 * Reads the entries from the given DataView starting at the specified offset.
	 * @param offset - The offset in the DataView where the entries start.
	 * @returns An array of entries.
	 */
	protected _readEntries(offset: number): Array<Entry> {
		const numberOfEntries = this._dataView.getUint32(8, false);

		let currentOffset: number = offset;

		const entries: Array<Entry> = Array.from({ length: numberOfEntries }).map(
			() => {
				const type = this._dataView.getUint16(currentOffset, false);
				const blockLength = this._dataView.getUint32(currentOffset + 2, false);

				let entry: Entry;

				switch (type) {
					case this.ASE_BLOCK_TYPE_COLOR:
						entry = this._readColor(currentOffset + 6);
						break;

					case this.ASE_BLOCK_TYPE_GROUP_START:
						entry = this._readGroup(currentOffset + 6);
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
	protected _readColor(offset: number): ColorEntry {
		const nameLength = this._dataView.getUint16(offset, false);
		const colorOffset = offset + 2 + nameLength * 2;
		const type = "color";
		const name = this._readUTF16BE(offset + 2, nameLength);

		const componentToHex = (value: number) =>
			Math.floor(value * 255)
				.toString(16)
				.toUpperCase()
				.padStart(2, "0");

		const model = new TextDecoder("utf-8")
			.decode(new Uint8Array(this._dataView.buffer, colorOffset, 4))
			.trim();

		let color: RGBColor | CMYKColor | GrayColor | LABColor;

		switch (model) {
			case "RGB": {
				const r = this._dataView.getFloat32(colorOffset + 4, false);
				const g = this._dataView.getFloat32(colorOffset + 8, false);
				const b = this._dataView.getFloat32(colorOffset + 12, false);
				const hex = `${componentToHex(r)}${componentToHex(g)}${componentToHex(
					b
				)}`;
				const type =
					this.ASE_COLOR_TYPES[
						this._dataView.getUint16(colorOffset + 16, false)
					];

				color = { model, r, g, b, hex, type } satisfies RGBColor;
				break;
			}

			case "CMYK": {
				const c = this._dataView.getFloat32(colorOffset + 4, false);
				const m = this._dataView.getFloat32(colorOffset + 8, false);
				const y = this._dataView.getFloat32(colorOffset + 12, false);
				const k = this._dataView.getFloat32(colorOffset + 16, false);
				const type =
					this.ASE_COLOR_TYPES[
						this._dataView.getUint16(colorOffset + 20, false)
					];

				color = { model, c, m, y, k, type } satisfies CMYKColor;
				break;
			}

			case "Gray": {
				const gray = this._dataView.getFloat32(colorOffset + 4, false);
				const hex = `${componentToHex(gray)}${componentToHex(
					gray
				)}${componentToHex(gray)}`;
				const type =
					this.ASE_COLOR_TYPES[
						this._dataView.getUint16(colorOffset + 8, false)
					];

				color = { model, gray, hex, type } satisfies GrayColor;
				break;
			}

			case "LAB": {
				const lightness = this._dataView.getFloat32(colorOffset + 4, false);
				const a = this._dataView.getFloat32(colorOffset + 8, false);
				const b = this._dataView.getFloat32(colorOffset + 12, false);
				const type =
					this.ASE_COLOR_TYPES[
						this._dataView.getUint16(colorOffset + 16, false)
					];

				color = { model, lightness, a, b, type } satisfies LABColor;
				break;
			}

			default: {
				throw new Error(
					`Unsupported color model: ${model} at offset ${colorOffset}`
				);
			}
		}

		const colorEntry: ColorEntry = { type, name, color };

		return colorEntry;
	}

	/**
	 * Reads a group start from the given DataView at the specified offset.
	 * @param offset - The offset in the DataView where the group start starts.
	 * @returns A Group object.
	 */
	protected _readGroup(offset: number): GroupEntry {
		const type = "group";
		const nameLength = this._dataView.getUint16(offset, false);
		const name = this._readUTF16BE(offset + 2, nameLength);
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
	 * Reads an ASE file and returns the colors/groups.
	 * @returns An array of colors/groups.
	 */
	public read(): Array<Entry> {
		const signature = this._dataView.getUint32(0, false);

		if (signature !== this.ASE_SIGNATURE) {
			console.error("Invalid file signature: ASEF header expected");
			return [];
		}

		const majorVersionNumber = this._dataView.getUint16(4, false);
		const minorVersionNumber = this._dataView.getUint16(6, false);
		const version = `${majorVersionNumber}.${minorVersionNumber}`;

		if (version !== this.ASE_SUPPORTED_VERSION) {
			console.error(
				`Only version ${this.ASE_SUPPORTED_VERSION} of the ASE format is supported`
			);
			return [];
		}

		try {
			const rawEntries = this._readEntries(12);
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
}

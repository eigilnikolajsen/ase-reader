# ase-reader

Reads Adobe ASE files.

## Install

```bash
npm install --save-dev ase-reader
```

## Usage

```typescript
import { AseReader } from "ase-reader";

const aseReader = new AseReader(aseFile);

const entries = aseReader.read();
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build
```

## License

This is free software under the GPL-3.0 license. See LICENSE file for details.

The code is copyleft - you can freely use and modify it, but any modifications must also be free software under the same terms.

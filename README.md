# publications-list

Automatically fetches publication data from DBLP for research group members.

## Quick Start

```bash
npm install
npm run fetch
```

## Files

```
scripts/
└── fetch-publications.js    # Main fetcher

config.json                  # Author configuration
data/                        # Generated files
├── all-publications.json    # Combined data
└── {author-slug}.json       # Individual files

frontend.js                  # Frontend display logic
```

## Configuration

Edit `config.json` to add authors:

```json
{
  "authors": {
    "author-slug": {
      "dblpId": "123/456",
      "minYear": 2000,
      "nameVariations": ["Full Name", "Alt Name"]
    }
  }
}
```


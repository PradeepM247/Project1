# Route Finder

A web-based route finding application that provides detailed directions between two locations with additional travel information.

## Features

- 🗺️ Interactive map with route visualization
- 📍 Find routes between any two addresses
- ℹ️ Detailed route information including distance and estimated time
- 🚗 Toll road information
- 🚦 Real-time traffic updates
- 🎨 Customizable theme
- ⚡ Fast and responsive interface

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Redis (for production caching)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/PradeepM247/Project1.git
   cd Project1
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Production

To run in production mode:

```bash
npm start
```

## Usage

1. Enter a starting address (e.g., "Dallas, TX")
2. Enter a destination address (e.g., "McKinney, TX")
3. Click "Get Directions" to see the route
4. View route details, toll information, and traffic information in the side panels

## Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Mapping**: Leaflet.js with OSRM (Open Source Routing Machine)
- **Backend**: Node.js with Express
- **Caching**: Redis with local fallback
- **Performance**: Rate limiting, compression, and security headers
- **Scalability**: Node.js clustering for multi-core support

## Configuration

Environment variables can be set in a `.env` file:

```
PORT=3000
REDIS_URL=redis://localhost:6379
```

## License

ISC

## Author

Pradeep M

---

*Note: This project is for demonstration purposes.*

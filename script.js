// Initialize map centered on Dallas area
const map = L.map('map').setView([32.7767, -96.7970], 11);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Initialize controls and markers
let routingControl = null;
let startMarker = null;
let endMarker = null;
let tollMarkers = [];
let trafficLayers = [];

// Dallas area toll roads data
const dallasAreaTolls = [
    {
        name: "Dallas North Tollway",
        segments: [
            { start: [32.9215, -96.8207], end: [33.0176, -96.8238], cost: 1.52 },
            { start: [33.0176, -96.8238], end: [33.1006, -96.8271], cost: 1.83 }
        ]
    },
    {
        name: "President George Bush Turnpike",
        segments: [
            { start: [32.8881, -96.9641], end: [32.9092, -96.7079], cost: 1.91 },
            { start: [32.9092, -96.7079], end: [32.9715, -96.6361], cost: 1.72 }
        ]
    },
    {
        name: "Sam Rayburn Tollway",
        segments: [
            { start: [33.0379, -96.8238], end: [33.0946, -96.7369], cost: 1.63 },
            { start: [33.0946, -96.7369], end: [33.1506, -96.6439], cost: 1.45 }
        ]
    }
];

// Traffic congestion simulation data
const trafficData = [
    { location: [32.9215, -96.8207], severity: "severe", delay: 15 },
    { location: [33.0176, -96.8238], severity: "moderate", delay: 8 },
    { location: [32.9092, -96.7079], severity: "light", delay: 3 }
];

// Custom icons for start and end points
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

async function geocodeAddress(address) {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    const data = await response.json();
    if (data.length === 0) {
        throw new Error('Address not found');
    }
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

function checkForTolls(route) {
    let totalTollCost = 0;
    let tollRoads = new Set();
    let coordinates = route.coordinates;

    dallasAreaTolls.forEach(tollRoad => {
        tollRoad.segments.forEach(segment => {
            // Check if route passes near toll segment
            for (let i = 0; i < coordinates.length - 1; i++) {
                const routePoint = coordinates[i];
                const startPoint = L.latLng(segment.start);
                const endPoint = L.latLng(segment.end);
                
                if (distanceToSegment(routePoint, startPoint, endPoint) < 0.5) { // Increased to 500m for better detection
                    tollRoads.add(tollRoad.name);
                    totalTollCost += segment.cost;
                    
                    // Add toll marker if not already present
                    const markerPos = [(segment.start[0] + segment.end[0])/2, 
                                     (segment.start[1] + segment.end[1])/2];
                    const tollMarker = L.marker(markerPos, {
                        icon: L.divIcon({
                            className: 'toll-marker',
                            html: '💰',
                            iconSize: [20, 20]
                        })
                    }).bindPopup(`${tollRoad.name}<br>Cost: $${segment.cost.toFixed(2)}`);
                    tollMarkers.push(tollMarker);
                    tollMarker.addTo(map);
                    break; // Once we find a match for this segment, move to next
                }
            }
        });
    });

    return {
        hasTolls: tollRoads.size > 0,
        tollRoads: Array.from(tollRoads),
        totalCost: totalTollCost
    };
}

function checkTrafficConditions(route) {
    let totalDelay = 0;
    let conditions = new Set(); // Use Set to avoid duplicates
    let coordinates = route.coordinates;
    let processedTraffic = new Set(); // Track which traffic points we've already counted

    trafficData.forEach(traffic => {
        let isOnRoute = false;
        for (let i = 0; i < coordinates.length - 1; i++) {
            const routePoint = coordinates[i];
            const trafficPoint = L.latLng(traffic.location);
            
            if (routePoint.distanceTo(trafficPoint) < 1000 && !processedTraffic.has(traffic.location.toString())) { // Within 1km
                isOnRoute = true;
                processedTraffic.add(traffic.location.toString());
                conditions.add(JSON.stringify({
                    location: traffic.location,
                    severity: traffic.severity,
                    delay: traffic.delay
                }));
                totalDelay += traffic.delay;
                break; // Count each traffic point only once
            }
        }
        
        if (isOnRoute) {
            // Add traffic marker
            const icon = L.divIcon({
                className: `traffic-marker traffic-${traffic.severity}`,
                html: traffic.severity === 'severe' ? '🔴' : 
                      traffic.severity === 'moderate' ? '🟡' : '🟢',
                iconSize: [20, 20]
            });
            
            L.marker(traffic.location, { icon })
                .bindPopup(`Traffic: ${traffic.severity}<br>Delay: ${traffic.delay} mins`)
                .addTo(map);
        }
    });

    const uniqueConditions = Array.from(conditions).map(c => JSON.parse(c));
    
    return {
        hasTraffic: uniqueConditions.length > 0,
        conditions: uniqueConditions,
        totalDelay: totalDelay
    };
}

function distanceToSegment(point, segmentStart, segmentEnd) {
    const p = L.latLng(point);
    return Math.min(p.distanceTo(segmentStart), p.distanceTo(segmentEnd));
}

// Function to create route segments with traffic colors
function createTrafficColoredRoute(route) {
    // Clear any existing traffic layers
    trafficLayers.forEach(layer => map.removeLayer(layer));
    trafficLayers = [];

    const coordinates = route.coordinates;
    
    // First, create the entire route in green (default)
    let mainRoute = L.polyline(coordinates, {
        color: '#008000',
        weight: 6,
        opacity: 0.8
    }).addTo(map);
    trafficLayers.push(mainRoute);

    // Then overlay segments with traffic
    trafficData.forEach(traffic => {
        const trafficPoint = L.latLng(traffic.location);
        
        // Find the closest points on the route to this traffic location
        let affectedSegments = [];
        let foundTraffic = false;
        
        for (let i = 0; i < coordinates.length - 1; i++) {
            const point1 = L.latLng(coordinates[i]);
            const point2 = L.latLng(coordinates[i + 1]);
            
            if (point1.distanceTo(trafficPoint) < 2000 || point2.distanceTo(trafficPoint) < 2000) {
                foundTraffic = true;
                affectedSegments.push([coordinates[i], coordinates[i + 1]]);
            } else if (foundTraffic) {
                break; // Stop after we've found all connected segments
            }
        }

        // Create colored segments for traffic areas
        affectedSegments.forEach(segment => {
            const color = traffic.severity === 'severe' ? '#ff0000' : 
                         traffic.severity === 'moderate' ? '#ffa500' : 
                         '#008000';
            
            const trafficSegment = L.polyline(segment, {
                color: color,
                weight: 6,
                opacity: 0.8
            }).addTo(map);
            
            trafficLayers.push(trafficSegment);
        });
    });
}

async function updateRoute() {
    try {
        const startAddress = document.getElementById('start-address').value;
        const endAddress = document.getElementById('end-address').value;

        // Clear existing markers and routes
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);
        if (routingControl) {
            map.removeControl(routingControl);
        }
        tollMarkers.forEach(marker => map.removeLayer(marker));
        tollMarkers = [];
        trafficLayers.forEach(layer => map.removeLayer(layer));
        trafficLayers = [];

        // Convert addresses to coordinates
        const startPoint = await geocodeAddress(startAddress);
        const endPoint = await geocodeAddress(endAddress);

        // Add colored markers
        startMarker = L.marker(startPoint, {icon: greenIcon})
            .bindPopup('Start: ' + startAddress)
            .addTo(map);
        
        endMarker = L.marker(endPoint, {icon: redIcon})
            .bindPopup('End: ' + endAddress)
            .addTo(map);

        // Create new routing control without visible lines
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(startPoint[0], startPoint[1]),
                L.latLng(endPoint[0], endPoint[1])
            ],
            router: new L.Routing.OSRMv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'driving'
            }),
            routeWhileDragging: false,
            showAlternatives: false,
            lineOptions: {
                styles: [
                    {color: 'transparent', opacity: 0, weight: 0}
                ]
            },
            createMarker: function() { return null; },
            addWaypoints: false
        });

        routingControl.addTo(map);

        // Update route info when route is found
        routingControl.on('routesfound', function(e) {
            const route = e.routes[0];
            const bounds = L.latLngBounds([startPoint, endPoint]);
            map.fitBounds(bounds, { padding: [50, 50] });
            
            const distanceKm = (route.summary.totalDistance / 1000).toFixed(1);
            const distanceMiles = (distanceKm * 0.621371).toFixed(1);
            const time = Math.round(route.summary.totalTime / 60);
            
            // Check for tolls and traffic
            const tollInfo = checkForTolls(route);
            const trafficInfo = checkTrafficConditions(route);

            // Create colored route segments based on traffic
            createTrafficColoredRoute(route);
            
            // Update route information
            document.querySelector('#route-info .route-details').innerHTML = 
                `<p><strong>Distance:</strong> ${distanceMiles} miles (${distanceKm} km)</p>
                 <p><strong>Estimated time:</strong> ${time} minutes</p>` +
                 (trafficInfo.totalDelay > 0 ? 
                 `<p><strong>Potential delay:</strong> ${trafficInfo.totalDelay} minutes due to traffic</p>` : 
                 '<p>No significant traffic delays</p>');

            // Update toll information
            document.querySelector('#toll-info .toll-details').innerHTML = tollInfo.hasTolls ?
                `<p><strong>Toll Roads:</strong></p>
                 <ul>${tollInfo.tollRoads.map(road => `<li>${road}</li>`).join('')}</ul>
                 <p><strong>Total Toll Cost:</strong> $${tollInfo.totalCost.toFixed(2)}</p>` :
                '<p>No toll roads on this route</p>';

            // Update traffic information
            document.querySelector('#traffic-info .traffic-details').innerHTML = trafficInfo.hasTraffic ?
                `<p><strong>Current Traffic Conditions:</strong></p>
                 <ul>${trafficInfo.conditions.map(c => 
                     `<li class="traffic-${c.severity}">
                         ${c.severity.charAt(0).toUpperCase() + c.severity.slice(1)} traffic
                         (${c.delay} min delay)
                     </li>`).join('')}</ul>` :
                '<p>No significant traffic on this route</p>';
        });
    } catch (error) {
        document.querySelector('#route-info .route-details').innerHTML = 
            `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

// Initial route calculation
updateRoute();
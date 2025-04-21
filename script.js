// Initialize map centered on Dallas area
const map = L.map('map').setView([32.7767, -96.7970], 11);

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

// Initialize controls and markers
let routingControl = null;
let startMarker = null;
let endMarker = null;
let tollMarkers = [];
let trafficLayers = [];

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Initialize marker clusters
const poiLayers = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 18,
    maxClusterRadius: 50,
    iconCreateFunction: function(cluster) {
        const childCount = cluster.getChildCount();
        return L.divIcon({
            html: `<div class="cluster-icon">👥${childCount}</div>`,
            className: 'marker-cluster',
            iconSize: L.point(40, 40)
        });
    }
}).addTo(map);

// Constants
const MIN_ZOOM_FOR_POIS = 15; // Only show POIs when zoomed in this far

// POI categories with icons
const poiCategories = {
    restaurant: { icon: '🍴', name: 'Restaurants', color: '#ff7675' },
    cafe: { icon: '☕', name: 'Cafes', color: '#fab1a0' },
    fast_food: { icon: '🍔', name: 'Fast Food', color: '#ffeaa7' },
    bar: { icon: '🍺', name: 'Bars', color: '#fdcb6e' },
    hotel: { icon: '🏨', name: 'Hotels', color: '#74b9ff' },
    supermarket: { icon: '🏪', name: 'Supermarkets', color: '#55efc4' },
    parking: { icon: '🅿️', name: 'Parking', color: '#a8e6cf' },
    gas_station: { icon: '⛽', name: 'Gas Stations', color: '#dfe6e9' }
};

let poiControl = null;

// Function to fetch POIs from Overpass API
async function fetchPOIs(bounds, category) {
    const query = `
        [out:json][timeout:25];
        (
            node["amenity"="${category}"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            way["amenity"="${category}"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            relation["amenity"="${category}"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        );
        out body;
        >;
        out skel qt;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error('Error fetching POIs:', error);
        return [];
    }
}

// Function to update POIs on the map
async function updatePOIs() {
    const currentZoom = map.getZoom();
    poiLayers.clearLayers();
    
    // Only show POIs if zoomed in enough
    if (currentZoom < MIN_ZOOM_FOR_POIS) {
        document.querySelector('.poi-control').classList.add('poi-control-disabled');
        document.querySelector('.zoom-hint').style.display = 'block';
        return;
    }

    document.querySelector('.poi-control').classList.remove('poi-control-disabled');
    document.querySelector('.zoom-hint').style.display = 'none';
    
    const bounds = map.getBounds();
    const visibleCategories = document.querySelectorAll('.poi-checkbox:checked');
    
    for (const checkbox of visibleCategories) {
        const category = checkbox.value;
        const pois = await fetchPOIs(bounds, category);
        const categoryInfo = poiCategories[category];
        
        pois.forEach(poi => {
            if (poi.lat && poi.lon) {
                const marker = L.marker([poi.lat, poi.lon], {
                    icon: L.divIcon({
                        className: `poi-marker ${category}-marker`,
                        html: `<div class="emoji-marker" style="background-color: ${categoryInfo.color}">${categoryInfo.icon}</div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        popupAnchor: [0, -16]
                    })
                });
                
                const name = poi.tags.name || categoryInfo.name;
                const address = poi.tags['addr:street'] ? 
                    `${poi.tags['addr:housenumber'] || ''} ${poi.tags['addr:street'] || ''}` : '';
                
                marker.bindPopup(`
                    <strong>${name}</strong><br>
                    ${address}<br>
                    ${categoryInfo.icon} ${category.charAt(0).toUpperCase() + category.slice(1)}
                `);
                
                poiLayers.addLayer(marker);
            }
        });
    }
}

// Add POI controls to the map
function addPOIControls() {
    if (poiControl) {
        poiControl.remove();
    }

    const poiDiv = L.DomUtil.create('div', 'poi-control');
    poiDiv.innerHTML = `
        <h4>Places of Interest</h4>
        <div class="zoom-hint">Zoom in to see places</div>
        ${Object.entries(poiCategories).map(([category, info]) => `
            <label>
                <input type="checkbox" class="poi-checkbox" value="${category}">
                <span class="poi-icon" style="background-color: ${info.color}20">${info.icon}</span>
                ${info.name}
            </label>
        `).join('')}
    `;

    poiControl = L.control({ position: 'topright' });
    poiControl.onAdd = function() {
        return poiDiv;
    };
    poiControl.addTo(map);

    // Add event listeners to checkboxes
    poiDiv.querySelectorAll('.poi-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updatePOIs);
    });
}

// Initialize POI controls
addPOIControls();

// Add event listeners for map movement and zoom
map.on('moveend zoomend', updatePOIs);

// Theme management
function initializeTheme() {
    const savedColor = localStorage.getItem('backgroundColor') || '#ffffff';
    document.body.style.backgroundColor = savedColor;
    document.getElementById('background-color').value = savedColor;
}

function updateBackgroundColor(event) {
    const color = event.target.value;
    document.body.style.backgroundColor = color;
    localStorage.setItem('backgroundColor', color);
}

function resetTheme() {
    const defaultColor = '#ffffff';
    document.body.style.backgroundColor = defaultColor;
    document.getElementById('background-color').value = defaultColor;
    localStorage.setItem('backgroundColor', defaultColor);
}

// Draggable directions panel functionality
function initializeDraggableDirections() {
    const directionsContainer = document.getElementById('directions-container');
    const dragHandle = directionsContainer.querySelector('.drag-handle');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    dragHandle.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === dragHandle || e.target.parentNode === dragHandle) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, directionsContainer);
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }
}

function toggleDirections() {
    const container = document.getElementById('directions-container');
    container.classList.toggle('minimized');
}

// Add event listeners for theme controls and draggable directions
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    document.getElementById('background-color').addEventListener('input', updateBackgroundColor);
    initializeDraggableDirections();
});

// Function to fetch coordinates for an address
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

        // Show loading state
        document.querySelector('#route-info .route-details').innerHTML = 
            `<p>Calculating route from ${startAddress} to ${endAddress}...</p>`;

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

        console.log('Start point:', startPoint);
        console.log('End point:', endPoint);

        // Add colored markers
        startMarker = L.marker(startPoint, {icon: greenIcon})
            .bindPopup('Start: ' + startAddress)
            .addTo(map);
        
        endMarker = L.marker(endPoint, {icon: redIcon})
            .bindPopup('End: ' + endAddress)
            .addTo(map);

        // Create new routing control with OSRM configuration
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(startPoint[0], startPoint[1]),
                L.latLng(endPoint[0], endPoint[1])
            ],
            router: new L.Routing.OSRMv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'driving',
                numberOfAlternatives: 2
            }),
            show: false,
            showAlternatives: true,
            lineOptions: {
                styles: [{color: '#0073FF', opacity: 0.8, weight: 6}],
                missingRouteTolerance: 0
            },
            altLineOptions: {
                styles: [
                    {color: '#00ff00', opacity: 0.6, weight: 6},  // Green for first alternative
                    {color: '#ff0000', opacity: 0.6, weight: 6}   // Red for second alternative
                ]
            },
            createMarker: function() { return null; },
            fitSelectedRoutes: true
        }).addTo(map);

        // Set up route found event handler with improved error checking
        routingControl.on('routesfound', function(e) {
            if (!e || !e.routes || !e.routes[0]) {
                document.querySelector('#route-info .route-details').innerHTML = 
                    `<p style="color: red;">Error: No valid route found</p>`;
                return;
            }

            const mainRoute = e.routes[0];
            const alternatives = e.routes.slice(1);
            
            // Fit the map to show all routes
            let allCoordinates = [];
            e.routes.forEach(route => allCoordinates = allCoordinates.concat(route.coordinates));
            if (allCoordinates.length > 0) {
                const bounds = L.latLngBounds(allCoordinates);
                map.fitBounds(bounds, { padding: [50, 50] });
            }
            
            // Calculate route information for main route
            const distanceKm = (mainRoute.summary.totalDistance / 1000).toFixed(1);
            const distanceMiles = (distanceKm * 0.621371).toFixed(1);
            const time = Math.round(mainRoute.summary.totalTime / 60);
            
            // Check for tolls and traffic on main route
            const tollInfo = checkForTolls(mainRoute);
            const trafficInfo = checkTrafficConditions(mainRoute);

            // Create colored route segments based on traffic for main route
            createTrafficColoredRoute(mainRoute);
            
            // Generate a legend for the routes
            let routeInfo = `
                <div class="main-route">
                    <div class="route-legend">
                        <span class="route-color" style="background: #0073FF"></span>
                        <strong>Main Route:</strong> ${distanceMiles} mi (${time} min)
                    </div>`;
            
            alternatives.forEach((route, index) => {
                const altDistanceKm = (route.summary.totalDistance / 1000).toFixed(1);
                const altDistanceMiles = (altDistanceKm * 0.621371).toFixed(1);
                const altTime = Math.round(route.summary.totalTime / 60);
                const color = index === 0 ? '#00ff00' : '#ff0000';
                
                routeInfo += `
                    <div class="route-legend">
                        <span class="route-color" style="background: ${color}"></span>
                        <strong>Alternative ${index + 1}:</strong> ${altDistanceMiles} mi (${altTime} min)
                    </div>`;
            });
            
            routeInfo += '</div>';
            
            // Update route information
            document.querySelector('#route-info .route-details').innerHTML = routeInfo;

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

        // Handle routing errors with more detail
        routingControl.on('routingerror', function(e) {
            console.error('Routing error:', e);
            document.querySelector('#route-info .route-details').innerHTML = 
                `<p style="color: red;">Error calculating route: ${e.error ? e.error.message : 'Could not find a route between these locations'}</p>`;
        });

    } catch (error) {
        console.error('Error in updateRoute:', error);
        document.querySelector('#route-info .route-details').innerHTML = 
            `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

// Initial route calculation
updateRoute();
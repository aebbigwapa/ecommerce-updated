// Rider Map Integration using Leaflet (OpenStreetMap) + OSRM for routing
class RiderMap {
  constructor() {
    this.map = null;
    this.markers = [];
    this.popups = [];
    this.deliveries = [];
    this.routeLayer = null;
    this.shopMarkersByKey = new Map();
    this.defaultCenter = [14.5995, 120.9842]; // Manila, Philippines [lat, lng]
  }

  // Initialize Leaflet map
  async initializeMap(containerId = 'map') {
    try {
      console.log('🗺️ Initializing Leaflet map...');
      const mapContainer = document.getElementById(containerId);
      if (!mapContainer) {
        console.error(`❌ Map container '${containerId}' not found`);
        return false;
      }

      this.map = L.map(containerId, {
        zoomControl: true,
        attributionControl: true
      }).setView(this.defaultCenter, 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.map);

      console.log('✅ Leaflet initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing Leaflet:', error);
      this.showMapError('Failed to initialize map. Please refresh the page.');
      return false;
    }
  }

  // Geocode address using Nominatim (OpenStreetMap)
  async geocodeAddress(addressString) {
    if (!addressString || !addressString.trim()) {
      return null;
    }
    
    try {
      // Add Philippines to the address for better geocoding
      const fullAddress = addressString.includes('Philippines') 
        ? addressString 
        : `${addressString}, Philippines`;
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=ph`,
        {
          headers: {
            'User-Agent': 'GrandeEcommerceApp/1.0'
          }
        }
      );
      
      if (!response.ok) {
        console.warn(`⚠️ Geocoding failed for address: ${addressString}`);
        return null;
      }
      
      const data = await response.json();
      if (data && data.length > 0) {
        const result = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          display_name: data[0].display_name
        };
        console.log(`✅ Geocoded address: ${addressString} -> ${result.lat}, ${result.lng}`);
        return result;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error geocoding address "${addressString}":`, error);
      return null;
    }
  }

  // Load and display delivery pins (expects coordinates from backend, geocodes if missing)
  async loadDeliveryPins(deliveries) {
    try {
      console.log('📍 Loading delivery pins...', deliveries.length);
      this.deliveries = deliveries;
      this.clearMarkers();

      if (!deliveries || deliveries.length === 0) {
        console.log('ℹ️ No deliveries to display');
        return;
      }

      const bounds = L.latLngBounds();

      // De-duplicate shop markers by lat,lng
      const shopSet = new Set();

      for (const d of deliveries) {
        // Buyer/customer pin
        let buyerLat = null;
        let buyerLng = null;
        
        // First try to use existing coordinates
        if (isFinite(d.buyer_lat) && isFinite(d.buyer_lng)) {
          buyerLat = Number(d.buyer_lat);
          buyerLng = Number(d.buyer_lng);
        } else {
          // Geocode the delivery address if coordinates are missing
          const deliveryAddress = d.delivery_address || d.buyer_address || d.buyer_full_address || '';
          if (deliveryAddress) {
            console.log(`📍 Geocoding buyer address for order ${d.order_number}: ${deliveryAddress}`);
            const geocoded = await this.geocodeAddress(deliveryAddress);
            if (geocoded) {
              buyerLat = geocoded.lat;
              buyerLng = geocoded.lng;
              // Update the delivery object with geocoded coordinates
              d.buyer_lat = buyerLat;
              d.buyer_lng = buyerLng;
            }
          }
        }
        
        if (buyerLat !== null && buyerLng !== null && isFinite(buyerLat) && isFinite(buyerLng)) {
          const marker = L.marker([buyerLat, buyerLng], {
            icon: this.buildLabeledIcon(d)
          }).addTo(this.map);

          const popupHtml = this.buildPopupHtml(d);
          marker.bindPopup(popupHtml);
          marker.on('click', () => this.onPinClick(d));

          marker.deliveryData = d;
          this.markers.push(marker);
          bounds.extend([buyerLat, buyerLng]);
          console.log(`✅ Buyer pin added: ${buyerLat}, ${buyerLng} for order ${d.order_number}`);
        } else {
          console.warn(`⚠️ Could not determine buyer coordinates for order ${d.order_number}`);
        }

        // Shop/seller pin (if available)
        let sellerLat = null;
        let sellerLng = null;
        
        // First try to use existing coordinates
        if (isFinite(d.seller_lat) && isFinite(d.seller_lng)) {
          sellerLat = Number(d.seller_lat);
          sellerLng = Number(d.seller_lng);
        } else {
          // Geocode the pickup/seller address if coordinates are missing
          const sellerAddress = d.pickup_address || d.seller_address || d.seller_full_address || '';
          if (sellerAddress) {
            console.log(`📍 Geocoding seller address for order ${d.order_number}: ${sellerAddress}`);
            const geocoded = await this.geocodeAddress(sellerAddress);
            if (geocoded) {
              sellerLat = geocoded.lat;
              sellerLng = geocoded.lng;
              // Update the delivery object with geocoded coordinates
              d.seller_lat = sellerLat;
              d.seller_lng = sellerLng;
            }
          }
        }
        
        if (sellerLat !== null && sellerLng !== null && isFinite(sellerLat) && isFinite(sellerLng)) {
          const skey = `${Number(sellerLat).toFixed(6)},${Number(sellerLng).toFixed(6)}`;
          if (!shopSet.has(skey)) {
            shopSet.add(skey);
            const sellerName = d.seller_name || 'Shop';
            
            const shopMarker = L.marker([sellerLat, sellerLng], {
              icon: this.buildShopIcon(sellerName)
            }).addTo(this.map);
            
            // Add popup for seller pin
            const sellerPopupHtml = this.buildSellerPopupHtml(d, sellerName);
            shopMarker.bindPopup(sellerPopupHtml);
            
            this.shopMarkersByKey.set(skey, shopMarker);
            bounds.extend([sellerLat, sellerLng]);
            console.log(`✅ Seller pin added: ${sellerLat}, ${sellerLng} for ${sellerName}`);
          }
        } else {
          console.warn(`⚠️ Could not determine seller coordinates for order ${d.order_number}`);
        }
      }

      if (bounds.isValid()) {
        this.map.fitBounds(bounds.pad(0.15));
        console.log(`✅ Map bounds set to show all pins`);
      }

      console.log(`✅ ${this.markers.length} buyer pins and ${this.shopMarkersByKey.size} seller pins loaded`);
    } catch (error) {
      console.error('❌ Error loading delivery pins:', error);
      this.showError('Failed to load delivery locations');
    }
  }

  buildLabeledIcon(delivery) {
    const label = delivery.customer_name || delivery.order_number || 'Stop';
    const html = `
      <div class="leaflet-marker-label" style="transform: translate(-50%, -100%);">
        <div style="background:#e63946;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px;border:1px solid rgba(0,0,0,0.15);white-space:nowrap;">${this.escapeHtml(label)}</div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #e63946;margin:0 auto;"></div>
      </div>`;
    return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
  }

  buildShopIcon(sellerName) {
    // Use a custom blue marker icon for seller/shop (pickup location)
    // Create a custom div icon with blue styling to distinguish from buyer pins
    const html = `
      <div class="leaflet-marker-label" style="transform: translate(-50%, -100%);">
        <div style="background:#1d3557;color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:600;border:2px solid #fff;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <i class="fas fa-store" style="margin-right:4px;"></i>${this.escapeHtml(sellerName || 'Shop')}
        </div>
        <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #1d3557;margin:0 auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"></div>
      </div>`;
    return L.divIcon({ 
      html, 
      className: 'seller-marker-icon', 
      iconSize: [0, 0], 
      iconAnchor: [0, 0],
      popupAnchor: [0, -10]
    });
  }
  
  buildSellerPopupHtml(delivery, sellerName) {
    // Use the actual registered address, prioritizing seller_full_address which comes from user_addresses
    const pickupAddress = delivery.pickup_address || delivery.seller_address || delivery.seller_full_address || 'Address not available';
    const sellerLat = delivery.seller_lat || null;
    const sellerLng = delivery.seller_lng || null;
    
    return `
      <div style="min-width:260px;">
        <div style="border-bottom:1px solid #e9ecef;padding-bottom:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <h6 style="margin:0;color:#1d3557;"><i class="fas fa-store me-1"></i>${this.escapeHtml(sellerName || 'Shop')}</h6>
          <span class="badge bg-info text-white">PICKUP</span>
        </div>
        <div style="font-size:13px;color:#444;">
          <div style="margin-bottom:4px;"><strong>Order:</strong> #${this.escapeHtml(delivery.order_number || '')}</div>
          <div style="margin-bottom:4px;"><strong>Pickup Address:</strong><br><span style="font-size:12px;color:#666;">${this.escapeHtml(pickupAddress)}</span></div>
          <div style="margin-bottom:6px;"><strong>Phone:</strong> ${this.escapeHtml(delivery.seller_phone || 'N/A')}</div>
          ${sellerLat && sellerLng ? `
          <button class="btn btn-primary btn-sm w-100" onclick="riderMap.navigateToStop(${sellerLat}, ${sellerLng})">
            <i class="fas fa-directions"></i> Navigate to Pickup
          </button>` : `
          <button class="btn btn-primary btn-sm w-100" onclick="window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent('${this.escapeHtml(pickupAddress)}'), '_blank')">
            <i class="fas fa-map-marker-alt"></i> View Address on Map
          </button>`}
        </div>
      </div>`;
  }

  buildPopupHtml(delivery) {
    const statusClass = this.getStatusClass(delivery.status);
    // Use the actual registered address, prioritizing buyer_full_address which comes from user_addresses
    const deliveryAddress = delivery.delivery_address || delivery.buyer_address || delivery.buyer_full_address || 'Address not available';
    const buyerLat = delivery.buyer_lat || null;
    const buyerLng = delivery.buyer_lng || null;
    
    return `
      <div style="min-width:260px;">
        <div style="border-bottom:1px solid #e9ecef;padding-bottom:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <h6 style="margin:0;color:#e63946;"><i class="fas fa-user me-1"></i>Order #${this.escapeHtml(delivery.order_number || '')}</h6>
          <span class="badge ${statusClass}">${this.escapeHtml((delivery.status || '').replace('_',' ').toUpperCase())}</span>
        </div>
        <div style="font-size:13px;color:#444;">
          <div style="margin-bottom:4px;"><strong>Buyer:</strong> ${this.escapeHtml(delivery.customer_name || 'Unknown')}</div>
          <div style="margin-bottom:4px;"><strong>Phone:</strong> ${this.escapeHtml(delivery.customer_phone || 'N/A')}</div>
          <div style="margin-bottom:6px;"><strong>Delivery Address:</strong><br><span style="font-size:12px;color:#666;">${this.escapeHtml(deliveryAddress)}</span></div>
          ${buyerLat && buyerLng ? `
          <button class="btn btn-success btn-sm w-100" onclick="riderMap.navigateToStop(${buyerLat}, ${buyerLng})">
            <i class="fas fa-directions"></i> Navigate to Delivery
          </button>` : `
          <button class="btn btn-success btn-sm w-100" onclick="window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent('${this.escapeHtml(deliveryAddress)}'), '_blank')">
            <i class="fas fa-map-marker-alt"></i> View Address on Map
          </button>`}
        </div>
      </div>`;
  }

  // Get status CSS class
  getStatusClass(status) {
    const classes = {
      'assigned': 'bg-info text-white',
      'picked_up': 'bg-warning text-dark',
      'in_transit': 'bg-primary text-white',
      'delivered': 'bg-success text-white'
    };
    return classes[status] || 'bg-secondary text-white';
  }

  // Handle pin click events
  onPinClick(delivery) {
    document.dispatchEvent(new CustomEvent('deliveryPinClicked', { detail: { delivery } }));
  }

  // External navigation (OpenStreetMap)
  navigateToStop(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng)) return;
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${lat}%2C${lng}%3B${lat}%2C${lng}`;
    window.open(url, '_blank');
  }

  // Clear all markers and route
  clearMarkers() {
    this.markers.forEach(m => m.remove());
    this.markers = [];
    // Leave shop markers persistent per loadDeliveryPins; they are rebuilt each call
    this.shopMarkersByKey.forEach(m => m.remove());
    this.shopMarkersByKey.clear();
    if (this.routeLayer) {
      this.routeLayer.remove();
      this.routeLayer = null;
    }
  }

  // Show optimized route using OSRM Trip API (from first shop to all buyer points)
  async showRoute(deliveries = null) {
    try {
      const points = (deliveries || this.deliveries).filter(d => isFinite(d.buyer_lat) && isFinite(d.buyer_lng));
      if (points.length < 2) {
        console.log('ℹ️ Need at least 2 delivery points to plot a route');
        return;
      }
      // Determine shop origin: prefer the first available seller coords in the list
      const firstWithShop = (deliveries || this.deliveries).find(d => isFinite(d.seller_lat) && isFinite(d.seller_lng));
      const origin = firstWithShop ? [Number(firstWithShop.seller_lat), Number(firstWithShop.seller_lng)] : [Number(points[0].buyer_lat), Number(points[0].buyer_lng)];

      // Build coordinates list: origin first, then all buyer points
      const coords = [origin, ...points.map(p => [Number(p.buyer_lat), Number(p.buyer_lng)])];
      const coordStr = coords.map(([lat,lng]) => `${lng},${lat}`).join(';');

      // Use OSRM Trip API to optimize order of waypoints
      const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data || data.code !== 'Ok' || !data.trips || !data.trips[0]) {
        console.warn('OSRM trip failed or returned no route:', data);
        return;
      }

      const route = data.trips[0];
      const line = L.geoJSON(route.geometry, {
        style: { color: '#007bff', weight: 4, opacity: 0.85 }
      });
      if (this.routeLayer) this.routeLayer.remove();
      this.routeLayer = line.addTo(this.map);

      const b = line.getBounds();
      if (b.isValid()) this.map.fitBounds(b.pad(0.1));
      console.log('✅ Route displayed successfully');
    } catch (error) {
      console.error('❌ Error showing route:', error);
    }
  }

  // Hide route polyline
  hideRoute() {
    if (this.routeLayer) {
      this.routeLayer.remove();
      this.routeLayer = null;
    }
  }

  // Center map on specific delivery
  centerOnDelivery(deliveryId) {
    const marker = this.markers.find(m => m.deliveryData && m.deliveryData.id === deliveryId);
    if (marker) {
      this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 15), { animate: true });
      marker.openPopup();
    }
  }

  showMapError(message) {
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;background:#f8f9fa;border:2px dashed #dee2e6;border-radius:8px;text-align:center;padding:20px;">
          <div>
            <i class="fas fa-map-marked-alt fa-3x text-muted mb-3"></i>
            <h5 class="text-muted">${this.escapeHtml(message)}</h5>
            <p class="text-muted small">Please check your connection and try again.</p>
          </div>
        </div>`;
    }
  }

  showError(message) {
    if (typeof riderDashboard !== 'undefined' && riderDashboard.showToast) {
      riderDashboard.showToast(message, 'error');
    } else {
      console.error('❌', message);
    }
  }

  escapeHtml(text) {
    if (!text && text !== 0) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
}

// Create a global instance immediately for pages that expect window.riderMap
let riderMap = new RiderMap();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RiderMap;
}

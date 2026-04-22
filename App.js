import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from 'geolib';
import { WebView } from 'react-native-webview'; // --- NEW IMPORT ---

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); 
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // --- NEW: SCREEN NAVIGATION STATE ---
  const [activeScreen, setActiveScreen] = useState('map'); // 'map' or 'game'

  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showBackpack, setShowBackpack] = useState(false);
  const [inventory, setInventory] = useState({ common: 0, rare: 0, epic: 0, legendary: 0 });
  const [uiDistance, setUiDistance] = useState(0); 

  const mapRef = useRef(null); 
  const lastLocation = useRef(null);
  const distanceWalked = useRef(0);
  const distanceSinceLastEpic = useRef(0);

  // --- LOGIN ---
  const handleLogin = () => {
    if (emailInput === '' || passwordInput === '') return Alert.alert("Error", "Please enter credentials.");
    if (emailInput.toLowerCase() === 'dev@admin.com' && passwordInput === 'admin123') {
      setCurrentUser({ email: emailInput, isGodMode: true });
    } else {
      setCurrentUser({ email: emailInput, isGodMode: false });
    }
  };

  // --- GPS ---
  useEffect(() => {
    let sub;
    if (currentUser) {
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return setErrorMsg('Permission denied');
        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation(loc.coords);
        lastLocation.current = loc.coords;

        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 2 }, (newLoc) => {
          setLocation(newLoc.coords);
          if (lastLocation.current) {
            const dist = getDistance(lastLocation.current, newLoc.coords);
            const speed = newLoc.coords.speed > 0 ? newLoc.coords.speed : (dist / 3);
            if (speed < 4) { 
              distanceWalked.current += dist;
              distanceSinceLastEpic.current += dist;
              if (distanceSinceLastEpic.current >= 1000) {
                distanceSinceLastEpic.current -= 1000; 
                setInventory(p => ({ ...p, epic: p.epic + 1 }));
                Alert.alert("Milestone!", "You walked 1km and earned an Epic Seed!");
              }
              setUiDistance(Math.floor(distanceWalked.current));
            }
          }
          lastLocation.current = newLoc.coords; 
        });
      })();
    }
    return () => { if (sub) sub.remove(); };
  }, [currentUser]);

  const recenterMap = () => {
    if (location && mapRef.current) {
      mapRef.current.animateCamera({
        center: { latitude: location.latitude, longitude: location.longitude }, pitch: 60, heading: 0, zoom: 16
      }, { duration: 1000 }); 
    }
  };

  const handleClaimReward = () => {
    const dist = getDistance(location, selectedStation.coords);
    const MINIMUM_DISTANCE = currentUser.isGodMode ? Infinity : 15; 
    if (dist <= MINIMUM_DISTANCE) { 
      const isRare = Math.random() > 0.7; 
      if (isRare) {
        setInventory(p => ({ ...p, rare: p.rare + 1 }));
        Alert.alert("Success!", "You found an Unknown Rare Seed!");
      } else {
        setInventory(p => ({ ...p, common: p.common + 1 }));
        Alert.alert("Success!", "You found an Unknown Common Seed!");
      }
      setSelectedStation(null); 
    } else {
      Alert.alert("Too Far!", `You are ${dist}m away.`);
    }
  };

  const handleCraftLegendary = () => {
    if (inventory.epic >= 3) {
      setInventory(p => ({ ...p, epic: p.epic - 3, legendary: p.legendary + 1 }));
      Alert.alert("Crafted!", "You combined 3 Epic Seeds into a Legendary Seed!");
    }
  };


  // ==========================================
  //                VIEWS
  // ==========================================

  if (!currentUser) {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.appTitle}>TREK n TREE</Text>
        <Text style={styles.subtitle}>Tracker & Eco-Garden</Text>
        <TextInput style={styles.input} placeholder="Email Address" autoCapitalize="none" value={emailInput} onChangeText={setEmailInput} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry={true} value={passwordInput} onChangeText={setPasswordInput} />
        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}><Text style={styles.loginButtonText}>Login</Text></TouchableOpacity>
      </View>
    );
  }

  if (!location) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#4CAF50" /><Text>Activating GPS Tracker...</Text></View>;
  }

  return (
    <View style={styles.container}>
      
      {/* --- VIEW 1: THE MAP --- */}
      <View style={[styles.screenWrapper, { display: activeScreen === 'map' ? 'flex' : 'none' }]}>
        <MapView
          ref={mapRef} 
          style={styles.map}
          initialCamera={{ center: { latitude: location.latitude, longitude: location.longitude }, pitch: 60, heading: 0, altitude: 1000, zoom: 16 }}
          showsUserLocation={true} followsUserLocation={true}
          showsMyLocationButton={false} toolbarEnabled={false} showsCompass={false} pitchEnabled={false} 
          onPoiClick={(e) => setSelectedStation({ name: e.nativeEvent.name, coords: e.nativeEvent.coordinate })} 
        />
        {currentUser.isGodMode && <View style={styles.godBadge}><Text style={styles.godBadgeText}>⚡ GOD MODE</Text></View>}
      </View>

      {/* --- VIEW 2: THE UNITY GAME CONTAINER --- */}
      <View style={[styles.screenWrapper, { display: activeScreen === 'game' ? 'flex' : 'none' }]}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameTitle}>My Eco-Garden</Text>
          <Text style={styles.gameSubtitle}>Seeds are waiting to be planted!</Text>
        </View>
        
        {/* THIS IS YOUR EMPTY PLACEHOLDER! 
          When your Unity WebGL link is ready, replace the placeholder text below 
          with your actual URL, like this: source={{ uri: 'https://your-game-link.com' }} 
        */}
        <View style={styles.unityContainer}>
          <WebView 
            source={{ html: '<div style="display:flex;justify-content:center;align-items:center;height:100%;font-family:sans-serif;background-color:#2b2b2b;color:white;text-align:center;"><h1>[Unity Game Placeholder]</h1><p>Paste your Unity WebGL URL into App.js</p></div>' }} 
            style={{ flex: 1 }}
            scrollEnabled={false}
            bounces={false}
          />
        </View>
      </View>


      {/* --- FLOATING BOTTOM MENU (Always Visible) --- */}
      <View style={styles.bottomControlsArea} pointerEvents="box-none">
        {/* Left: Backpack */}
        <TouchableOpacity style={styles.floatingButton} onPress={() => setShowBackpack(true)}>
          <Text style={styles.floatingButtonIcon}>🎒</Text>
        </TouchableOpacity>

        {/* Middle: Toggle Map/Game Screen */}
        <TouchableOpacity 
          style={[styles.floatingButton, styles.mainActionButton]} 
          onPress={() => setActiveScreen(activeScreen === 'map' ? 'game' : 'map')}
        >
          <Text style={styles.floatingButtonIcon}>{activeScreen === 'map' ? '🎮' : '🗺️'}</Text>
        </TouchableOpacity>

        {/* Right: Recenter (Only works on Map screen) */}
        <TouchableOpacity 
          style={[styles.floatingButton, activeScreen === 'game' && {opacity: 0.5}]} 
          onPress={activeScreen === 'map' ? recenterMap : null}
          disabled={activeScreen === 'game'}
        >
          <Text style={styles.floatingButtonIcon}>📍</Text>
        </TouchableOpacity>
      </View>


      {/* --- BACKPACK MODAL --- */}
      <Modal visible={showBackpack} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.backpackCard}>
            <Text style={styles.backpackTitle}>Your Inventory</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statText}>👣 Walked: {uiDistance}m</Text>
              <Text style={styles.statText}>Next Epic: {1000 - Math.floor(distanceSinceLastEpic.current)}m</Text>
            </View>
            <View style={styles.inventoryGrid}>
              <Text style={styles.seedItem}>🟢 Common: {inventory.common}</Text>
              <Text style={styles.seedItem}>🔵 Rare: {inventory.rare}</Text>
              <Text style={styles.seedItem}>🟣 Epic: {inventory.epic}</Text>
              <Text style={styles.seedItem}>🟡 Legendary: {inventory.legendary}</Text>
            </View>
            <TouchableOpacity style={[styles.craftButton, inventory.epic < 3 && styles.craftButtonDisabled]} onPress={handleCraftLegendary} disabled={inventory.epic < 3}>
              <Text style={styles.craftButtonText}>Craft Legendary (Costs 3 Epic)</Text>
            </TouchableOpacity>
            
            {/* Added a button to jump straight to the game from the backpack */}
            <TouchableOpacity style={styles.syncButton} onPress={() => { setShowBackpack(false); setActiveScreen('game'); }}>
              <Text style={styles.syncButtonText}>🌱 Open Garden</Text>
            </TouchableOpacity>

            <View style={styles.bottomButtonsRow}>
              <TouchableOpacity style={styles.logoutButton} onPress={() => setCurrentUser(null)}><Text style={styles.logoutButtonText}>Log Out</Text></TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowBackpack(false)}><Text style={styles.closeButtonText}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- POI CHECK-IN MODAL --- */}
      <Modal visible={selectedStation !== null} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          {selectedStation && (
            <View style={styles.popupCard}>
              <Text style={styles.stationName}>{selectedStation.name}</Text>
              <Text style={styles.rewardText}>Search this area for a Common or Rare seed!</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => setSelectedStation(null)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.claimButton]} onPress={handleClaimReward}><Text style={styles.claimButtonText}>Search Area</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  screenWrapper: { flex: 1 }, // Holds the map or the game
  map: { width: '100%', height: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Game Container Styles
  gameHeader: { backgroundColor: 'white', paddingTop: 60, paddingBottom: 20, alignItems: 'center', elevation: 5, zIndex: 10 },
  gameTitle: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32' },
  gameSubtitle: { fontSize: 14, color: '#666' },
  unityContainer: { flex: 1, backgroundColor: '#000' }, // The black box where Unity will live

  // Login
  loginContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  appTitle: { fontSize: 32, fontWeight: 'bold', color: '#2E7D32', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  loginButton: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  godBadge: { position: 'absolute', top: 50, left: 20, backgroundColor: '#FFD700', padding: 10, borderRadius: 20, elevation: 5 },
  godBadgeText: { fontWeight: 'bold', color: '#000', fontStyle: 'italic' },

  // ERGONOMIC BOTTOM UI
  bottomControlsArea: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  floatingButton: { backgroundColor: 'white', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  mainActionButton: { width: 75, height: 75, borderRadius: 37.5, backgroundColor: '#e8f5e9', borderWidth: 2, borderColor: '#4CAF50' }, // Makes the middle button stand out
  floatingButtonIcon: { fontSize: 28 },

  // Modals & Backpack
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  popupCard: { backgroundColor: 'white', padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 20 },
  backpackCard: { backgroundColor: 'white', padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 20, height: '75%' },
  backpackTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 10 },
  statText: { fontSize: 14, fontWeight: 'bold', color: '#555' },
  inventoryGrid: { marginBottom: 20 },
  seedItem: { fontSize: 18, marginVertical: 5, fontWeight: '500' },
  craftButton: { backgroundColor: '#FFD700', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  craftButtonDisabled: { backgroundColor: '#e0e0e0' },
  craftButtonText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  syncButton: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  syncButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  bottomButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  logoutButton: { flex: 1, backgroundColor: '#ff4444', padding: 15, borderRadius: 10, alignItems: 'center', marginRight: 5 },
  logoutButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  closeButton: { flex: 1, backgroundColor: '#333', padding: 15, borderRadius: 10, alignItems: 'center', marginLeft: 5 },
  closeButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  // Check-In Modal
  stationName: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  rewardText: { fontSize: 16, color: '#666', marginBottom: 15 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  cancelButton: { backgroundColor: '#eee' },
  cancelButtonText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  claimButton: { backgroundColor: '#4CAF50' },
  claimButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
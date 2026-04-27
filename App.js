import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Modal, Alert, TextInput, Platform, Keyboard, ScrollView, KeyboardAvoidingView } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { getDistance } from 'geolib';
import { WebView } from 'react-native-webview'; 
import { Ionicons } from '@expo/vector-icons'; 

// --- FIREBASE IMPORTS ---
import { auth, db } from './firebase'; 
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'; 

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); 
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- SEARCH STATES ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]); 
  const searchTimeout = useRef(null); 

  const [activeScreen, setActiveScreen] = useState('map'); 
  const [location, setLocation] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [inventory, setInventory] = useState({ common: 0, rare: 0, epic: 0, legendary: 0 });
  const [uiDistance, setUiDistance] = useState(0); 
  const [cooldowns, setCooldowns] = useState({}); 
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);

  const mapRef = useRef(null); 
  const lastLocation = useRef(null);
  const distanceWalked = useRef(0);
  const distanceSinceLastEpic = useRef(0);

  // ==========================================
  //          DATABASE SYNC HELPER
  // ==========================================
  const saveProgressToCloud = async (newInventory, newDistance) => {
    if (currentUser && currentUser.uid !== 'god_mode') {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), {
          inventory: newInventory,
          distanceWalked: newDistance
        });
      } catch (error) {
        console.error("Failed to sync to cloud:", error);
      }
    }
  };

  // ==========================================
  //               AUTHENTICATION
  // ==========================================
  const handleLogin = async () => {
    Keyboard.dismiss(); 
    if (emailInput === '' || passwordInput === '') return Alert.alert("Error", "Please enter credentials.");
    
    if (emailInput.toLowerCase() === 'dev@admin.com' && passwordInput === 'admin123') {
      return setCurrentUser({ email: emailInput, name: "Admin", uid: 'god_mode', isGodMode: true });
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
      const uid = userCredential.user.uid;

      const docSnap = await getDoc(doc(db, "users", uid));
      if (docSnap.exists()) {
        const savedData = docSnap.data();
        setInventory(savedData.inventory);
        setUiDistance(savedData.distanceWalked);
        distanceWalked.current = savedData.distanceWalked; 
        setCurrentUser({ email: emailInput, name: savedData.username, uid: uid, isGodMode: false });
      } else {
        const startingInventory = { common: 0, rare: 0, epic: 0, legendary: 0 };
        await setDoc(doc(db, "users", uid), {
          username: "Recovered Explorer", 
          email: emailInput.trim(),
          inventory: startingInventory,
          distanceWalked: 0
        });
        setInventory(startingInventory);
        setUiDistance(0);
        setCurrentUser({ email: emailInput.trim(), name: "Recovered Explorer", uid: uid, isGodMode: false });
      }
    } catch (error) {
      Alert.alert("Login Failed", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    Keyboard.dismiss(); 
    if (emailInput === '' || passwordInput === '' || usernameInput === '') return Alert.alert("Error", "Please fill in all fields.");
    if (passwordInput !== confirmPasswordInput) return Alert.alert("Error", "Passwords do not match!");
    
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
      const uid = userCredential.user.uid;

      const startingInventory = { common: 0, rare: 0, epic: 0, legendary: 0 };
      await setDoc(doc(db, "users", uid), {
        username: usernameInput,
        email: emailInput.trim(),
        inventory: startingInventory,
        distanceWalked: 0
      });

      setIsLoading(false);
      Alert.alert("Account Created!", "Welcome to TREKnTREE. Your eco-journey starts now!", [{ 
          text: "Start Playing", 
          onPress: () => {
            setCurrentUser({ email: emailInput.trim(), name: usernameInput, uid: uid, isGodMode: false });
            setInventory(startingInventory);
            setUiDistance(0);
          }
      }]);
    } catch (error) {
      setIsLoading(false);
      Alert.alert("Registration Failed", error.message);
    }
  };

  // ==========================================
  //         TRUE PREDICTIVE SEARCH API 
  // ==========================================
  const handleLiveSearch = (text) => {
    setSearchText(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    if (text.length > 1) {
      searchTimeout.current = setTimeout(async () => {
        try {
          // --- FIX: Added &lat and &lon to bias the search to the user's current GPS location ---
          let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=6`;
          
          if (location) {
            url += `&lat=${location.latitude}&lon=${location.longitude}`;
          }

          const response = await fetch(url);
          const data = await response.json();
          setSearchResults(data.features || []);
        } catch (err) {
          console.log("Search error:", err);
        }
      }, 300); 
    } else {
      setSearchResults([]); 
    }
  };

  const handleSelectPlace = (place) => {
    Keyboard.dismiss(); 
    const lon = place.geometry.coordinates[0];
    const lat = place.geometry.coordinates[1];
    
    if (mapRef.current) {
      mapRef.current.animateCamera({ 
        center: { latitude: lat, longitude: lon }, 
        pitch: 60, heading: 0, zoom: 17 
      }, { duration: 1500 });
    }

    setIsSearchOpen(false);
    setSearchText('');
    setSearchResults([]);
  };

  // ==========================================
  //               GPS & GAMEPLAY
  // ==========================================
  useEffect(() => {
    let sub;
    if (currentUser) {
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
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
                setInventory(p => {
                  const newInv = { ...p, epic: p.epic + 1 };
                  saveProgressToCloud(newInv, Math.floor(distanceWalked.current)); 
                  return newInv;
                });
                Alert.alert("Milestone!", "Walked 1km! Earned an Epic Seed!");
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
      mapRef.current.animateCamera({ center: { latitude: location.latitude, longitude: location.longitude }, pitch: 60, heading: 0, zoom: 16 }, { duration: 1000 }); 
    }
  };

  const handleStationTap = (event) => {
    const stationCoords = event.nativeEvent.coordinate;
    setSelectedStation({ name: event.nativeEvent.name, coords: stationCoords });
    if (mapRef.current) {
      mapRef.current.animateCamera({ center: stationCoords, pitch: 70, heading: 0, zoom: 19 }, { duration: 800 });
    }
  };

  const cancelEncounter = () => {
    setSelectedStation(null);
    recenterMap(); 
  };

  const handleClaimReward = () => {
    const now = Date.now();
    const lastClaimedTime = cooldowns[selectedStation.name];
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    if (lastClaimedTime && (now - lastClaimedTime < ONE_DAY_IN_MS)) {
      const msLeft = ONE_DAY_IN_MS - (now - lastClaimedTime);
      const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
      return Alert.alert("Cooldown Active", `You have already searched this location today.\n\nCome back in ${hoursLeft} hours.`);
    }

    const dist = getDistance(location, selectedStation.coords);
    const MINIMUM_DISTANCE = currentUser.isGodMode ? Infinity : 15; 
    
    if (dist <= MINIMUM_DISTANCE) { 
      const isRare = Math.random() > 0.7; 
      
      setInventory(p => {
        const newInv = { ...p };
        if (isRare) {
          newInv.rare += 1;
          Alert.alert("Success!", "Found an Unknown Rare Seed!");
        } else {
          newInv.common += 1;
          Alert.alert("Success!", "Found an Unknown Common Seed!");
        }
        saveProgressToCloud(newInv, uiDistance);
        return newInv;
      });

      setCooldowns(prev => ({ ...prev, [selectedStation.name]: now }));
      cancelEncounter(); 
    } else {
      Alert.alert("Too Far!", `You are ${dist}m away. You need to be within ${MINIMUM_DISTANCE}m.`);
    }
  };

  const handleCraftLegendary = () => {
    if (inventory.epic >= 3) {
      setInventory(p => {
        const newInv = { ...p, epic: p.epic - 3, legendary: p.legendary + 1 };
        saveProgressToCloud(newInv, uiDistance); 
        return newInv;
      });
      Alert.alert("Crafted!", "Combined 3 Epic Seeds into a Legendary Seed!");
    }
  };

  // ==========================================
  //                VIEWS
  // ==========================================

  if (!currentUser) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled" bounces={false}>
          
          <Text style={styles.appTitle}>TREKnTREE</Text>
          <Text style={styles.subtitle}>{isRegistering ? 'Create a new account' : 'Login'}</Text>
          
          {isRegistering && (
            <TextInput style={styles.input} placeholder="Username" value={usernameInput} onChangeText={setUsernameInput} editable={!isLoading} />
          )}

          <TextInput style={styles.input} placeholder="Email Address" autoCapitalize="none" keyboardType="email-address" value={emailInput} onChangeText={setEmailInput} editable={!isLoading} />
          
          <View style={styles.passwordContainer}>
            <TextInput 
              style={styles.passwordInput} 
              placeholder="Password" 
              secureTextEntry={!showPassword} 
              value={passwordInput} 
              onChangeText={setPasswordInput} 
              editable={!isLoading} 
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {isRegistering && (
            <View style={styles.passwordContainer}>
              <TextInput 
                style={styles.passwordInput} 
                placeholder="Confirm Password" 
                secureTextEntry={!showConfirmPassword} 
                value={confirmPasswordInput} 
                onChangeText={setConfirmPasswordInput} 
                editable={!isLoading} 
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={24} color="#888" />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ minHeight: 100, justifyContent: 'center' }}>
            {isLoading ? (
              <View style={{ alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={{ marginTop: 10, color: '#666', fontWeight: 'bold' }}>
                  {isRegistering ? 'Creating your account...' : 'Connecting to server...'}
                </Text>
              </View>
            ) : (
              isRegistering ? (
                <>
                  <TouchableOpacity style={styles.loginButton} onPress={handleRegister}><Text style={styles.loginButtonText}>Register Account</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsRegistering(false)} style={styles.switchAuthButton}><Text style={styles.switchAuthText}>Already have an account? Log in</Text></TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.loginButton} onPress={handleLogin}><Text style={styles.loginButtonText}>Login</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsRegistering(true)} style={styles.switchAuthButton}><Text style={styles.switchAuthText}>Don't have an account? Register</Text></TouchableOpacity>
                </>
              )
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (!location) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#4CAF50" /><Text>Activating GPS...</Text></View>;
  }

  // --- GAME VIEW ---
  if (activeScreen === 'game') {
    return (
      <View style={styles.fullScreenGameContainer}>
        <TouchableOpacity style={styles.exitGameBtn} onPress={() => setActiveScreen('map')}>
          <Text style={styles.exitGameText}>⬅ Back to Map</Text>
        </TouchableOpacity>
        
        {/* Replace the placeholder HTML with your real URL */}
        <WebView 
          source={{ uri: 'https://trekntree.web.app' }} 
          style={{ flex: 1 }} 
          scrollEnabled={false} 
          bounces={false}
        />
      </View>
    );
  }

  // --- MAP VIEW ---
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef} style={styles.map}
        initialCamera={{ center: { latitude: location.latitude, longitude: location.longitude }, pitch: 60, heading: 0, altitude: 1000, zoom: 16 }}
        showsUserLocation={true} followsUserLocation={true}
        showsMyLocationButton={false} toolbarEnabled={false} showsCompass={false} pitchEnabled={false} 
        onPoiClick={handleStationTap} 
      />

      {!selectedStation && (
        <>
          <View style={styles.topRightSearchContainer} pointerEvents="box-none">
            {isSearchOpen ? (
              <View style={styles.searchExpandedWrapper}>
                <View style={styles.searchBarWrapper}>
                  <TextInput 
                    style={styles.searchInput} 
                    placeholder="Search location..." 
                    value={searchText}
                    onChangeText={handleLiveSearch} 
                    autoFocus={true} 
                  />
                  <TouchableOpacity style={styles.closeSearchBtn} onPress={() => { setIsSearchOpen(false); setSearchResults([]); setSearchText(''); Keyboard.dismiss(); }}>
                    <Text style={styles.closeSearchText}>✖</Text>
                  </TouchableOpacity>
                </View>

                {searchResults.length > 0 && (
                  <ScrollView style={styles.dropdownContainer} keyboardShouldPersistTaps="handled">
                    {searchResults.map((item, index) => (
                      <TouchableOpacity key={index} style={styles.dropdownItem} onPress={() => handleSelectPlace(item)}>
                        <Text style={styles.dropdownTitle} numberOfLines={1}>{item.properties.name}</Text>
                        <Text style={styles.dropdownSubtitle} numberOfLines={1}>
                          {[item.properties.street, item.properties.city, item.properties.state].filter(Boolean).join(', ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : (
              <TouchableOpacity style={styles.searchButton} onPress={() => setIsSearchOpen(true)}>
                <Text style={styles.searchIcon}>🔍</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.bottomUiOverlay} pointerEvents="box-none">
            
            <View style={styles.bottomLeftWidgetsContainer} pointerEvents="box-none">
              {currentUser.isGodMode && <View style={styles.godBadge}><Text style={styles.godBadgeText}>⚡ GOD MODE</Text></View>}
              <View style={styles.profileWidget}>
                <View style={styles.avatarCircle}><Text style={styles.avatarText}>🧑</Text></View>
                <View style={styles.profileStats}>
                  <Text style={styles.profileName}>{currentUser.name}</Text>
                  <Text style={styles.profileDistance}>{uiDistance}m</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.centerMenuButton} onPress={() => setIsMainMenuOpen(true)}>
              <View style={styles.centerMenuInner}><Text style={styles.centerMenuIcon}>🌍</Text></View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.radarButtonBottomRight} onPress={recenterMap}>
              <Text style={styles.radarIcon}>📍</Text>
            </TouchableOpacity>

          </View>
        </>
      )}

      {selectedStation && (
        <View style={styles.encounterOverlay}>
          <View style={styles.encounterTopBox}>
             <Text style={styles.encounterTitle}>{selectedStation.name}</Text>
          </View>
          <View style={styles.encounterBottomBox}>
            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={cancelEncounter}><Text style={styles.cancelButtonText}>Go Back</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.claimButton]} onPress={handleClaimReward}><Text style={styles.claimButtonText}>Search Area</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={isMainMenuOpen} animationType="fade" transparent={true}>
        <View style={styles.mainMenuOverlay}>
          <Text style={styles.menuTitle}>MAIN MENU</Text>
          <View style={styles.menuGrid}>
            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Inventory", `Common: ${inventory.common}\nRare: ${inventory.rare}\nEpic: ${inventory.epic}\nLegendary: ${inventory.legendary}`)}>
              <Text style={styles.menuItemIcon}>🎒</Text>
              <Text style={styles.menuItemText}>Inventory</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsMainMenuOpen(false); setActiveScreen('game'); }}>
              <Text style={styles.menuItemIcon}>🎮</Text>
              <Text style={styles.menuItemText}>Garden Game</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleCraftLegendary}>
              <Text style={styles.menuItemIcon}>🔨</Text>
              <Text style={styles.menuItemText}>Crafting</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { 
              saveProgressToCloud(inventory, uiDistance);
              setIsMainMenuOpen(false); 
              setCurrentUser(null); 
            }}>
              <Text style={styles.menuItemIcon}>🚪</Text>
              <Text style={styles.menuItemText}>Log Out</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.closeMenuButton} onPress={() => setIsMainMenuOpen(false)}><Text style={styles.closeMenuIcon}>✖️</Text></TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, map: { width: '100%', height: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  loginContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  appTitle: { fontSize: 32, fontWeight: 'bold', color: '#2E7D32', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40 },
  
  input: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  passwordInput: { flex: 1, padding: 15, fontSize: 16 },
  eyeButton: { padding: 15, justifyContent: 'center', alignItems: 'center' },

  loginButton: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  switchAuthButton: { marginTop: 20, alignItems: 'center' },
  switchAuthText: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold' },

  fullScreenGameContainer: { flex: 1, backgroundColor: 'black' },
  exitGameBtn: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, zIndex: 999 },
  exitGameText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  topRightSearchContainer: { position: 'absolute', top: 50, right: 20, alignItems: 'flex-end', zIndex: 10 },
  searchButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  searchIcon: { fontSize: 24 },
  searchExpandedWrapper: { width: 280, alignItems: 'flex-end' },
  searchBarWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 25, elevation: 5, paddingLeft: 20, paddingRight: 5, height: 50, width: '100%' },
  searchInput: { flex: 1, height: '100%', fontSize: 16 },
  closeSearchBtn: { padding: 10 },
  closeSearchText: { fontSize: 16, color: '#666', fontWeight: 'bold' },
  
  dropdownContainer: { width: '100%', backgroundColor: 'white', borderRadius: 15, marginTop: 10, padding: 5, elevation: 5, maxHeight: 250 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownTitle: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  dropdownSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },

  bottomUiOverlay: { position: 'absolute', bottom: 30, left: 0, right: 0, height: 70, justifyContent: 'center', alignItems: 'center' },
  
  bottomLeftWidgetsContainer: { position: 'absolute', left: 20, bottom: 10, justifyContent: 'flex-end', alignItems: 'flex-start' },
  profileWidget: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingRight: 15, borderRadius: 25, elevation: 5, height: 50 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#4CAF50' },
  avatarText: { fontSize: 24 },
  profileStats: { marginLeft: 10, justifyContent: 'center' },
  profileName: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  profileDistance: { fontSize: 12, color: '#666' },
  godBadge: { position: 'absolute', top: -20, left: 10, backgroundColor: '#FFD700', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, elevation: 5, zIndex: 2 },
  godBadgeText: { fontWeight: 'bold', color: '#000', fontStyle: 'italic', fontSize: 10 },

  centerMenuButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', alignItems: 'center' },
  centerMenuInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', elevation: 10, borderWidth: 3, borderColor: 'white' },
  centerMenuIcon: { fontSize: 30 },

  radarButtonBottomRight: { position: 'absolute', right: 20, bottom: 10, width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  radarIcon: { fontSize: 24 },

  encounterOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingVertical: 60, paddingHorizontal: 20, pointerEvents: 'box-none' },
  encounterTopBox: { backgroundColor: 'rgba(255,255,255,0.9)', padding: 20, borderRadius: 15, alignItems: 'center', elevation: 10 },
  encounterTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  encounterSubtitle: { fontSize: 14, color: '#4CAF50', marginTop: 5 },
  encounterBottomBox: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { flex: 1, padding: 18, borderRadius: 30, alignItems: 'center', marginHorizontal: 10, elevation: 5 },
  cancelButton: { backgroundColor: '#f44336' },
  cancelButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  claimButton: { backgroundColor: '#4CAF50' },
  claimButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  mainMenuOverlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.95)', paddingTop: 80, alignItems: 'center' },
  menuTitle: { fontSize: 24, fontWeight: 'bold', letterSpacing: 2, color: '#333', marginBottom: 40 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '90%', gap: 20 },
  menuItem: { width: '40%', aspectRatio: 1, backgroundColor: 'white', borderRadius: 20, justifyContent: 'center', alignItems: 'center', elevation: 5, marginBottom: 20 },
  menuItemIcon: { fontSize: 40, marginBottom: 10 },
  menuItemText: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  menuItemSubtext: { fontSize: 12, color: '#666', marginTop: 5 },
  closeMenuButton: { position: 'absolute', bottom: 30, width: 70, height: 70, borderRadius: 35, backgroundColor: '#f44336', justifyContent: 'center', alignItems: 'center', elevation: 10, borderWidth: 3, borderColor: 'white' },
  closeMenuIcon: { fontSize: 24, color: 'white' }
});
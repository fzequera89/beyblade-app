import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaguesScreen from '../screens/LeaguesScreen';
import CreateLeagueScreen from '../screens/CreateLeagueScreen';
import LeagueDetailScreen from '../screens/LeagueDetailScreen';
import TournamentsScreen from '../screens/TournamentsScreen';
import TournamentDetailScreen from '../screens/TournamentDetailScreen';
import BracketScreen from '../screens/BracketScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import LeagueStandingsScreen from '../screens/LeagueStandingsScreen';
import AdminScreen from '../screens/AdminScreen';
import AdminPlayersScreen from '../screens/AdminPlayersScreen';
import AdminGlobalRankingScreen from '../screens/AdminGlobalRankingScreen';
import VenuesScreen from '../screens/VenuesScreen';
import CreateVenueScreen from '../screens/CreateVenueScreen';
import VenueDetailScreen from '../screens/VenueDetailScreen';
import ScanCheckInScreen from '../screens/ScanCheckInScreen';
import NearMeScreen from '../screens/NearMeScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { session, hasPlayer, loading } = useAuth();

  if (loading || (session && hasPlayer === null)) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : !hasPlayer ? (
          <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
        ) : (
          <>
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Leagues" component={LeaguesScreen} />
            <Stack.Screen name="CreateLeague" component={CreateLeagueScreen} />
            <Stack.Screen name="LeagueDetail" component={LeagueDetailScreen} />
            <Stack.Screen name="Tournaments" component={TournamentsScreen} />
            <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
            <Stack.Screen name="Bracket" component={BracketScreen} />
            <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
            <Stack.Screen name="LeagueStandings" component={LeagueStandingsScreen} />
            <Stack.Screen name="Admin" component={AdminScreen} />
            <Stack.Screen name="AdminPlayers" component={AdminPlayersScreen} />
            <Stack.Screen name="AdminGlobalRanking" component={AdminGlobalRankingScreen} />
            <Stack.Screen name="Venues" component={VenuesScreen} />
            <Stack.Screen name="CreateVenue" component={CreateVenueScreen} />
            <Stack.Screen name="VenueDetail" component={VenueDetailScreen} />
            <Stack.Screen name="ScanCheckIn" component={ScanCheckInScreen} />
            <Stack.Screen name="NearMe" component={NearMeScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { useAuth } from '../context/AuthContext';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
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
import ChallengesScreen from '../screens/ChallengesScreen';
import StatsScreen from '../screens/StatsScreen';
import CombosScreen from '../screens/CombosScreen';
import RivalriesScreen from '../screens/RivalriesScreen';
import BadgesScreen from '../screens/BadgesScreen';
import EventsScreen from '../screens/EventsScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';
import FollowsScreen from '../screens/FollowsScreen';
import FeedScreen from '../screens/FeedScreen';
import ClubsScreen from '../screens/ClubsScreen';
import ClubDetailScreen from '../screens/ClubDetailScreen';
import PassportScreen from '../screens/PassportScreen';

const Stack = createNativeStackNavigator();

// Sin esto, React Navigation pinta su tema claro (#f2f2f2) detrás de cada
// pantalla y se ve un destello blanco en cada transición.
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.blue,
  },
};

export default function RootNavigator() {
  const { session, hasPlayer, loading } = useAuth();

  if (loading || (session && hasPlayer === null)) {
    return null;
  }

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
      >
        {!session ? (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : !hasPlayer ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
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
            <Stack.Screen name="Challenges" component={ChallengesScreen} />
            <Stack.Screen name="Stats" component={StatsScreen} />
            <Stack.Screen name="Combos" component={CombosScreen} />
            <Stack.Screen name="Rivalries" component={RivalriesScreen} />
            <Stack.Screen name="Badges" component={BadgesScreen} />
            <Stack.Screen name="Events" component={EventsScreen} />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} />
            <Stack.Screen name="EventDetail" component={EventDetailScreen} />
            <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
            <Stack.Screen name="Follows" component={FollowsScreen} />
            <Stack.Screen name="Feed" component={FeedScreen} />
            <Stack.Screen name="Clubs" component={ClubsScreen} />
            <Stack.Screen name="ClubDetail" component={ClubDetailScreen} />
            <Stack.Screen name="Passport" component={PassportScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

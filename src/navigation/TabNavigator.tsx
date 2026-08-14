import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabBar from './TabBar';
import { colors } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import BattlesScreen from '../screens/BattlesScreen';
import RankingsScreen from '../screens/RankingsScreen';
import PlayScreen from '../screens/PlayScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
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

// Cada pestaña tiene su propia pila para que el botón de atrás sea independiente:
// si estás cuatro pantallas adentro de Perfil y saltas a Batallas, al volver
// sigues donde ibas. Con un stack único eso no pasa.
//
// Varias pantallas (detalle de match, perfil de otro jugador) se registran en
// más de una pila a propósito: se llega a ellas desde contextos distintos y cada
// pestaña debe poder abrirlas sin sacarte de donde estás.

const stackOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.bg },
} as const;

const InicioStack = createNativeStackNavigator();
function Inicio() {
  return (
    <InicioStack.Navigator screenOptions={stackOptions}>
      <InicioStack.Screen name="Home" component={HomeScreen} />
      <InicioStack.Screen name="Feed" component={FeedScreen} />
      <InicioStack.Screen name="Follows" component={FollowsScreen} />
      <InicioStack.Screen name="Events" component={EventsScreen} />
      <InicioStack.Screen name="CreateEvent" component={CreateEventScreen} />
      <InicioStack.Screen name="EventDetail" component={EventDetailScreen} />
      <InicioStack.Screen name="MatchDetail" component={MatchDetailScreen} />
      <InicioStack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
      <InicioStack.Screen name="Passport" component={PassportScreen} />
      <InicioStack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <InicioStack.Screen name="Bracket" component={BracketScreen} />
      <InicioStack.Screen name="Challenges" component={ChallengesScreen} />
      <InicioStack.Screen name="Venues" component={VenuesScreen} />
      <InicioStack.Screen name="VenueDetail" component={VenueDetailScreen} />
    </InicioStack.Navigator>
  );
}

// Batallas es el centro competitivo: todo lo que se juega vive aquí — retos,
// matches, torneos y ligas. Antes los torneos estaban en Rankings, escondidos
// detrás del detalle de una liga, a cuatro toques de la barra.
const BatallasStack = createNativeStackNavigator();
function Batallas() {
  return (
    <BatallasStack.Navigator screenOptions={stackOptions}>
      <BatallasStack.Screen name="Battles" component={BattlesScreen} />
      <BatallasStack.Screen name="Challenges" component={ChallengesScreen} />
      <BatallasStack.Screen name="MatchDetail" component={MatchDetailScreen} />
      <BatallasStack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
      <BatallasStack.Screen name="Passport" component={PassportScreen} />
      <BatallasStack.Screen name="Leagues" component={LeaguesScreen} />
      <BatallasStack.Screen name="CreateLeague" component={CreateLeagueScreen} />
      <BatallasStack.Screen name="LeagueDetail" component={LeagueDetailScreen} />
      <BatallasStack.Screen name="LeagueStandings" component={LeagueStandingsScreen} />
      <BatallasStack.Screen name="Tournaments" component={TournamentsScreen} />
      <BatallasStack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <BatallasStack.Screen name="Bracket" component={BracketScreen} />
    </BatallasStack.Navigator>
  );
}

const PlayStack = createNativeStackNavigator();
function Play() {
  return (
    <PlayStack.Navigator screenOptions={stackOptions}>
      <PlayStack.Screen name="Find" component={PlayScreen} />
      <PlayStack.Screen name="Challenges" component={ChallengesScreen} />
      <PlayStack.Screen name="MatchDetail" component={MatchDetailScreen} />
      <PlayStack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
      <PlayStack.Screen name="Passport" component={PassportScreen} />
      <PlayStack.Screen name="Venues" component={VenuesScreen} />
      <PlayStack.Screen name="CreateVenue" component={CreateVenueScreen} />
      <PlayStack.Screen name="VenueDetail" component={VenueDetailScreen} />
      <PlayStack.Screen name="ScanCheckIn" component={ScanCheckInScreen} />
      <PlayStack.Screen name="Events" component={EventsScreen} />
      <PlayStack.Screen name="CreateEvent" component={CreateEventScreen} />
      <PlayStack.Screen name="EventDetail" component={EventDetailScreen} />
      <PlayStack.Screen name="Clubs" component={ClubsScreen} />
      <PlayStack.Screen name="ClubDetail" component={ClubDetailScreen} />
    </PlayStack.Navigator>
  );
}

// Rankings solo consulta posiciones. Nada que se juegue vive aquí: esa es la
// diferencia de intención con Batallas.
const RankingsStack = createNativeStackNavigator();
function Rankings() {
  return (
    <RankingsStack.Navigator screenOptions={stackOptions}>
      <RankingsStack.Screen name="Ranking" component={RankingsScreen} />
      <RankingsStack.Screen name="LeagueStandings" component={LeagueStandingsScreen} />
      <RankingsStack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
      <RankingsStack.Screen name="Passport" component={PassportScreen} />
    </RankingsStack.Navigator>
  );
}

const PerfilStack = createNativeStackNavigator();
function Perfil() {
  return (
    <PerfilStack.Navigator screenOptions={stackOptions}>
      <PerfilStack.Screen name="Profile" component={ProfileScreen} />
      <PerfilStack.Screen name="EditProfile" component={EditProfileScreen} />
      <PerfilStack.Screen name="Stats" component={StatsScreen} />
      <PerfilStack.Screen name="Combos" component={CombosScreen} />
      <PerfilStack.Screen name="Rivalries" component={RivalriesScreen} />
      <PerfilStack.Screen name="Badges" component={BadgesScreen} />
      <PerfilStack.Screen name="Passport" component={PassportScreen} />
      <PerfilStack.Screen name="Clubs" component={ClubsScreen} />
      <PerfilStack.Screen name="ClubDetail" component={ClubDetailScreen} />
      <PerfilStack.Screen name="MatchDetail" component={MatchDetailScreen} />
      <PerfilStack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
      <PerfilStack.Screen name="Admin" component={AdminScreen} />
      <PerfilStack.Screen name="AdminPlayers" component={AdminPlayersScreen} />
      <PerfilStack.Screen name="AdminGlobalRanking" component={AdminGlobalRankingScreen} />
    </PerfilStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tab.Screen name="Inicio" component={Inicio} />
      <Tab.Screen name="Batallas" component={Batallas} />
      <Tab.Screen name="Play" component={Play} />
      <Tab.Screen name="Rankings" component={Rankings} />
      <Tab.Screen name="Perfil" component={Perfil} />
    </Tab.Navigator>
  );
}

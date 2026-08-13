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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

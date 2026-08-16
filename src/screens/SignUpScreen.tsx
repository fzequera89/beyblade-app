import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Logo from '../ui/Logo';
import Button from '../ui/Button';
import { Field, PasswordField } from '../ui/Field';
import { Divider, Checkbox } from '../ui/primitives';
import { colors, space, type } from '../theme';

const MAX_USER = 20;

// Reglas de contraseña del formulario propuesto. Se validan aquí y no solo del
// lado de Supabase para poder decir QUÉ falta, en vez de un error genérico.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Debe tener al menos 8 caracteres.';
  if (!/[a-z]/.test(pw)) return 'Falta una minúscula.';
  if (!/[A-Z]/.test(pw)) return 'Falta una mayúscula.';
  if (!/[0-9]/.test(pw)) return 'Falta un número.';
  return null;
}

export default function SignUpScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const pwProblem = password ? passwordProblem(password) : null;
  const mismatch = touched && confirm.length > 0 && confirm !== password;

  async function signUp() {
    setTouched(true);

    if (!username.trim()) return alerta('Falta tu nombre', 'Elige el nombre con el que vas a competir.');
    if (!email.trim()) return alerta('Falta tu correo');
    const problem = passwordProblem(password);
    if (problem) return alerta('Contraseña insegura', problem);
    if (password !== confirm) return alerta('No coinciden', 'Las dos contraseñas deben ser iguales.');
    if (!terms) return alerta('Falta un paso', 'Tienes que aceptar los términos para crear tu cuenta.');

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // El nombre viaja en los metadatos para que el onboarding lo tome ya escrito
      // y el jugador no lo teclee dos veces.
      options: { data: { username: username.trim() } },
    });
    setLoading(false);

    if (error) {
      alerta('No pudimos crear tu cuenta', error.message);
      return;
    }

    // Con sesión, la app entra sola al onboarding: RootNavigator detecta que
    // todavía no hay jugador y lleva a personalizar el perfil.
    if (!data.session) {
      alerta(
        'Revisa tu correo',
        'Te mandamos un enlace para confirmar tu cuenta. Cuando lo abras, entra y terminamos tu perfil.'
      );
      navigation.navigate('SignIn');
    }
  }

  return (
    <Screen scroll>
      <View style={styles.brand}>
        <Logo size="md" />
      </View>

      <Text style={styles.title}>
        Crear <Text style={{ color: colors.blue }}>Cuenta</Text>
      </Text>
      <Text style={styles.sub}>Únete a la liga. Compite, conecta y crece.</Text>

      <View style={styles.form}>
        <Field
          label="Nombre de blader"
          counter={`${username.length}/${MAX_USER}`}
          icon={<Text style={styles.glyph}>👤</Text>}
          placeholder="Con el que te van a conocer"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={MAX_USER}
          value={username}
          onChangeText={setUsername}
        />

        <Field
          label="Correo electrónico"
          icon={<Text style={styles.glyph}>✉️</Text>}
          placeholder="tucorreo@ejemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <PasswordField
          label="Contraseña"
          placeholder="Crea una contraseña"
          value={password}
          onChangeText={setPassword}
          hint="Mínimo 8 caracteres, con mayúscula, minúscula y número."
          error={touched && pwProblem ? pwProblem : undefined}
        />

        <PasswordField
          label="Confirmar contraseña"
          placeholder="Repite tu contraseña"
          value={confirm}
          onChangeText={setConfirm}
          error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
        />

        <Checkbox checked={terms} onToggle={() => setTerms((t) => !t)}>
          <Text style={styles.terms}>
            Acepto los <Text style={styles.link}>Términos de Servicio</Text> y la{' '}
            <Text style={styles.link}>Política de Privacidad</Text>.
          </Text>
        </Checkbox>

        <Button label="CREAR CUENTA" onPress={signUp} loading={loading} />
      </View>

      <View style={styles.alt}>
        <Divider label="o continúa con" />
        <Button
          label="Google"
          variant="social"
          onPress={() => navigation.navigate('SignIn')}
          icon={<Text style={styles.glyph}>🔵</Text>}
        />
      </View>

      <View style={styles.footer}>
        <Text style={type.soft}>¿Ya tienes cuenta?</Text>
        <Pressable onPress={() => navigation.navigate('SignIn')} hitSlop={6}>
          <Text style={styles.linkStrong}>INICIAR SESIÓN ›</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: space.xxl, marginBottom: space.xl },
  title: { ...type.display, fontSize: 30 },
  sub: { ...type.soft, marginTop: 6, marginBottom: space.xl },
  form: { gap: space.lg },
  terms: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  link: { color: colors.blue, fontWeight: '600' },
  linkStrong: { color: colors.blue, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  alt: { gap: space.lg, marginTop: space.xxl },
  glyph: { fontSize: 14 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xxl,
  },
});

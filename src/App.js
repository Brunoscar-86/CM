  import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, onSnapshot, updateDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Home as HomeIcon, Users, Zap, Goal, ClipboardList, ShieldCheck } from 'lucide-react'; // Ícones para os menus

// Contexto para compartilhar o estado do Firebase e do usuário
const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

// --- CONFIGURAÇÃO CORRIGIDA DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBJByTn16IlHt8Dg6GzQ6tbUDYHnFwTLDk",
  authDomain: "teste-cm-5e785.firebaseapp.com",
  projectId: "teste-cm-5e785",
  storageBucket: "teste-cm-5e785.appspot.com",
  messagingSenderId: "959671211205",
  appId: "1:959671211205:web:04c2056a399e6d3b3f8cac"
};
// ----------------------------------------------------

// Função de utilidade para formatar números de telefone
const formatPhoneNumber = (value) => {
  // Remove tudo o que não é dígito
  const cleaned = ('' + value).replace(/\D/g, '');
  let formatted = '';

  // Aplica a máscara (DD) XXXXX-XXXX ou (DD) XXXX-XXXX
  if (cleaned.length > 0) {
    formatted += '(' + cleaned.substring(0, 2);
  }
  if (cleaned.length > 2) {
    formatted += ') ';
    if (cleaned.length <= 10) { // Telefone fixo (8 dígitos após o DDD)
      formatted += cleaned.substring(2, 6);
    } else { // Celular (9 dígitos após o DDD)
      formatted += cleaned.substring(2, 7);
    }
  }
  if (cleaned.length > 6) {
    formatted += '-';
    if (cleaned.length <= 10) { // Telefone fixo
      formatted += cleaned.substring(6, 10);
    } else { // Celular
      formatted += cleaned.substring(7, 11);
    }
  }
  return formatted;
};

// Mock de estados e cidades (para simplificar, em um app real seria um um fetch de API)
const states = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'BA', 'PE', 'CE', 'DF'];
const citiesByState = {
  SP: ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis'],
  PR: ['Curitiba', 'Londrina', 'Maringá', 'São José dos Pinhais'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau'],
  // ... adicione mais conforme necessário
};

// Função de utilidade para calcular o tempo desde uma data
const calculateTimeSince = (startDate) => {
  if (!startDate) return '';
  const start = new Date(startDate.toDate());
  const now = new Date();

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
    days += prevMonth.getDate(); // Add days in previous month
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0 && months === 0) {
    return `${days} dia${days !== 1 ? 's' : ''}`;
  } else if (years === 0) {
    return `${months} meses e ${days} dia${days !== 1 ? 's' : ''}`;
  } else {
    return `${years} ano${years !== 1 ? 's' : ''}, ${months} meses e ${days} dia${days !== 1 ? 's' : ''}`;
  }
};


// Componente para upload de imagem e conversão para base64
const ImageUpload = ({ label, onImageChange, currentImage }) => {
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result;

        img.onload = () => {
          const MAX_WIDTH = 800; // Largura máxima para a imagem
          const MAX_HEIGHT = 800; // Altura máxima para a imagem
          let width = img.width;
          let height = img.height;

          // Redimensionar se necessário para se ajustar às dimensões máximas
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Obter nova string Base64 com qualidade reduzida para menor tamanho
          const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7); // 0.7 = 70% de qualidade para JPEG

          onImageChange(resizedBase64);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-gray-700 text-sm font-bold mb-2">{label}</label>
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      />
      {currentImage && (
        <div className="mt-2 flex justify-center">
          <img src={currentImage} alt="Preview" className="w-24 h-24 object-cover rounded-md border" />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1">Imagens serão redimensionadas para otimizar o armazenamento e evitar limites de tamanho.</p>
    </div>
  );
};

// Componente modal genérico
const Modal = ({ show, title, message, onConfirm, onCancel, confirmText = "Confirmar", children, duration = 0 }) => {
  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        onCancel(); // Use onCancel to dismiss for timed modals
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onCancel]);

  if (!show) return null;

  const showButtons = duration === 0; // Only show buttons if no duration is set

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4 text-gray-800">{title}</h2>
        {message && <p className="text-gray-700 mb-6">{message}</p>}
        {children}
        {showButtons && (
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onCancel}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out"
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Componente de carregamento
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
  </div>
);

// Componente principal do aplicativo
const App = () => {
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMenu, setCurrentMenu] = useState('home');
  const [appId, setAppId] = useState(''); 
  const [configError, setConfigError] = useState(null);
  
  // Global data states for AppContext
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [team, setTeam] = useState(null);
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [fields, setFields] = useState([]);
  const [gameTypes, setGameTypes] = useState([]);

  // Feedback Modal State
  const [feedbackModal, setFeedbackModal] = useState({
    show: false,
    title: '',
    message: '',
    type: 'success', // 'success' or 'error'
    onConfirm: () => {}, // Default empty functions
    onCancel: () => {},   // Default empty functions
    confirmText: 'OK',
  });

  const showFeedback = useCallback((title, message, type, onConfirmCallback = null, onCancelCallback = null) => {
    setFeedbackModal({
      show: true,
      title,
      message,
      type,
      onConfirm: onConfirmCallback || (() => setFeedbackModal(prev => ({ ...prev, show: false }))),
      onCancel: onCancelCallback || (() => setFeedbackModal(prev => ({ ...prev, show: false }))),
      confirmText: type === 'confirm' ? 'Confirmar' : 'OK',
    });
  }, [setFeedbackModal]);


  // Inicialização do Firebase e autenticação, e carregamento de dados globais
  useEffect(() => {
    const initializeAppData = async () => {
      try {
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("COLE_SUA_API_KEY_AQUI")) {
            const errorMsg = "ERRO: As configurações do Firebase não foram preenchidas no código. Edite o ficheiro src/App.js e cole as suas credenciais.";
            console.error(errorMsg);
            setConfigError(errorMsg);
            setLoading(false);
            return;
        }

        const initializedApp = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(initializedApp);
        const firebaseAuth = getAuth(initializedApp);
        
        setDb(firestoreDb);

        const id = 'craque-manager-app';
        setAppId(id);

        let unsubscribeAuth;
        let unsubscribeSeasons;
        let unsubscribeTeamData;
        let unsubscribeGamesData;
        let unsubscribePlayersData;
        let unsubscribeFieldsData;
        let unsubscribeGameTypesData;

        unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
          if (user) {
            setUserId(user.uid);
            
            const gameTypesCollectionRef = collection(firestoreDb, `artifacts/${id}/users/${user.uid}/gameTypes`);
            unsubscribeGameTypesData = onSnapshot(gameTypesCollectionRef, (snapshot) => {
              if (snapshot.docs.length === 0) {
                  const batch = writeBatch(firestoreDb);
                  const defaultTypes = [
                      { name: 'Amistoso', isDefault: true, userId: user.uid },
                      { name: 'Campeonato', isDefault: true, userId: user.uid },
                      { name: 'Jogo entre amigos', isDefault: true, userId: user.uid },
                  ];
                  defaultTypes.forEach(type => {
                      const newDocRef = doc(gameTypesCollectionRef);
                      batch.set(newDocRef, type);
                  });
                  batch.commit();
              } else {
                  setGameTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
              }
            });

            const userSeasonsRef = collection(firestoreDb, `artifacts/${id}/users/${user.uid}/seasons`);
            unsubscribeSeasons = onSnapshot(userSeasonsRef, (snapshot) => {
              const fetchedSeasons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              setSeasons(fetchedSeasons);
              const today = new Date();
              const currentSeason = fetchedSeasons.find(s => {
                const startDate = s.startDate ? new Date(s.startDate.toDate()) : null;
                const endDate = s.endDate ? new Date(s.endDate.toDate()) : null;
                return startDate && endDate && today >= startDate && today <= endDate;
              });
              if (currentSeason) {
                setSelectedSeason(currentSeason);
              } else if (fetchedSeasons.length > 0) {
                const mostRecentSeason = fetchedSeasons.sort((a, b) => b.endDate.toDate() - a.endDate.toDate())[0];
                setSelectedSeason(mostRecentSeason);
              } else {
                setSelectedSeason(null);
              }
            });

            const teamCollectionRef = collection(firestoreDb, `artifacts/${id}/public/data/teams`);
            const qTeam = query(teamCollectionRef, where("userId", "==", user.uid));
            unsubscribeTeamData = onSnapshot(qTeam, (snapshot) => {
              if (!snapshot.empty) {
                setTeam({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
              } else {
                setTeam(null);
              }
            });

            const gamesCollectionRef = collection(firestoreDb, `artifacts/${id}/users/${user.uid}/games`);
            unsubscribeGamesData = onSnapshot(gamesCollectionRef, (snapshot) => {
              setGames(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            const playersCollectionRef = collection(firestoreDb, `artifacts/${id}/users/${user.uid}/players`);
            unsubscribePlayersData = onSnapshot(playersCollectionRef, (snapshot) => {
              setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            const fieldsCollectionRef = collection(firestoreDb, `artifacts/${id}/public/data/fields`);
            const qFields = query(fieldsCollectionRef, where("userId", "==", user.uid));
            unsubscribeFieldsData = onSnapshot(qFields, (snapshot) => {
              setFields(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            setLoading(false);
          } else {
            await signInAnonymously(firebaseAuth);
            setLoading(false);
          }
        });

        return () => {
          if (unsubscribeAuth) unsubscribeAuth();
          if (unsubscribeSeasons) unsubscribeSeasons();
          if (unsubscribeTeamData) unsubscribeTeamData();
          if (unsubscribeGamesData) unsubscribeGamesData();
          if (unsubscribePlayersData) unsubscribePlayersData();
          if (unsubscribeFieldsData) unsubscribeFieldsData();
          if (unsubscribeGameTypesData) unsubscribeGameTypesData();
        };
      } catch (error) {
        console.error("Erro na inicialização do Firebase ou busca de dados:", error);
        setConfigError("Ocorreu um erro crítico ao inicializar a aplicação. Verifique a consola para mais detalhes.");
        setLoading(false);
      }
    };
    initializeAppData();
  }, []);

  const handleSeasonChange = (e) => {
    const seasonId = e.target.value;
    const newSelectedSeason = seasons.find(s => s.id === seasonId);
    setSelectedSeason(newSelectedSeason);
  };


  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (configError) {
      return (
          <div className="flex items-center justify-center h-screen bg-red-100 text-red-800 p-4">
              <div className="text-center">
                  <h1 className="text-2xl font-bold mb-4">Erro de Configuração</h1>
                  <p>{configError}</p>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    if (!db || !userId || !appId) {
      return <div className="text-center text-red-500 mt-8">A inicializar...</div>;
    }

    switch (currentMenu) {
      case 'home':
        return <Home />;
      case 'team':
        return <TeamManagement />;
      case 'players':
        return <PlayerManagement />;
      case 'fields':
        return <FieldManagement />;
      case 'games':
        return <GameManagement />;
      default:
        return <Home />;
    }
  };

  return (
    <AppContext.Provider value={{ db, userId, appId, showFeedback, seasons, selectedSeason, setSelectedSeason, team, games, players, fields, gameTypes, loading, setCurrentMenu }}>
      <div className="font-sans antialiased text-gray-900 bg-gray-100 min-h-screen flex flex-col">
        {/* Header/Navbar */}
        <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg p-4 z-10">
          <h1 className="text-2xl font-extrabold text-center tracking-tight">Craque Manager</h1>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow overflow-auto p-2 sm:p-4">
          {renderContent()}
        </main>

        {/* Footer/Navigation */}
        <footer className="bg-blue-700 shadow-inner p-2 flex justify-around items-center sticky bottom-0 z-10">
          <NavItem icon={<HomeIcon size={24} />} label="Home" onClick={() => setCurrentMenu('home')} active={currentMenu === 'home'} />
          <NavItem icon={<Users size={24} />} label="Time" onClick={() => setCurrentMenu('team')} active={currentMenu === 'team'} />
          <NavItem icon={<Zap size={24} />} label="Jogadores" onClick={() => setCurrentMenu('players')} active={currentMenu === 'players'} />
          <NavItem icon={<Goal size={24} />} label="Campos" onClick={() => setCurrentMenu('fields')} active={currentMenu === 'fields'} />
          <NavItem icon={<ClipboardList size={24} />} label="Jogos" onClick={() => setCurrentMenu('games')} active={currentMenu === 'games'} />
        </footer>
      </div>

      {/* General Feedback Modal */}
      <Modal
        show={feedbackModal.show}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onConfirm={feedbackModal.onConfirm}
        onCancel={feedbackModal.onCancel}
        confirmText={feedbackModal.confirmText}
        duration={feedbackModal.type === 'confirm' ? 0 : 3000} // Auto-dismiss if not a 'confirm' type
      >
      </Modal>
    </AppContext.Provider>
  );
};

// Componente para item de navegação no rodapé
const NavItem = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center p-2 rounded-lg transition-all duration-200 ease-in-out w-16 ${
      active ? 'text-white bg-blue-600 scale-105' : 'text-blue-200 hover:text-white hover:bg-blue-500'
    }`}
  >
    {icon}
    <span className="text-xs mt-1 font-medium">{label}</span>
  </button>
);

export default App;

// --- Sub-componentes (Exportados para uso em App.jsx) ---

// Home.jsx
const Home = () => {
  const { games, players, fields, selectedSeason, seasons, setSelectedSeason, loading, team, setCurrentMenu } = useAppContext();

  const getDayOfWeek = (dateInput) => {
    if (!dateInput) return '';
    let dateObj;
    if (dateInput && typeof dateInput.toDate === 'function') {
      dateObj = dateInput.toDate();
    } else if (typeof dateInput === 'string' && dateInput.includes('-')) {
      dateObj = new Date(dateInput + 'T00:00:00');
    } else if (dateInput instanceof Date) {
      dateObj = dateInput;
    } else {
      return '';
    }
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return days[dateObj.getUTCDay()];
  };

  const gamesForSelectedSeason = useMemo(() => {
    if (!games || !Array.isArray(games)) return [];
    if (!selectedSeason || selectedSeason.id === 'all') return games;
    
    const seasonStartDate = selectedSeason.startDate ? new Date(selectedSeason.startDate.toDate()) : null;
    const seasonEndDate = selectedSeason.endDate ? new Date(selectedSeason.endDate.toDate()) : null;

    return games.filter(game => {
      const gameDate = game.date ? new Date(game.date.toDate()) : null;
      return gameDate && seasonStartDate && seasonEndDate && gameDate >= seasonStartDate && gameDate <= seasonEndDate;
    });
  }, [games, selectedSeason]);

  const calculateStats = useCallback((allGamesData, allPlayersData, allFieldsData, currentSelectedSeasonData) => {
    const safeAllGamesData = Array.isArray(allGamesData) ? allGamesData : [];
    const safeAllPlayersData = Array.isArray(allPlayersData) ? allPlayersData : [];
    const safeAllFieldsData = Array.isArray(allFieldsData) ? allFieldsData : [];

    let numGames = 0, wins = 0, losses = 0, draws = 0, goalsScored = 0, goalsConceded = 0, totalPointsAchieved = 0, totalPointsDisputed = 0;
    let nextGame = null, lastWinGame = null, biggestWin = null, biggestLoss = null;
    const playerPresenceCount = {}, playerGoalsCount = {}, playerHighlightsCount = {}, playerHatTricksCount = {};
    
    const now = new Date();

    const relevantGames = (currentSelectedSeasonData && currentSelectedSeasonData.id === 'all')
      ? safeAllGamesData 
      : safeAllGamesData.filter(game => {
          const gameDate = game.date ? new Date(game.date.toDate()) : null;
          const seasonStartDate = currentSelectedSeasonData?.startDate ? new Date(currentSelectedSeasonData.startDate.toDate()) : null;
          const seasonEndDate = currentSelectedSeasonData?.endDate ? new Date(currentSelectedSeasonData.endDate.toDate()) : null;
          return gameDate && seasonStartDate && seasonEndDate && gameDate >= seasonStartDate && gameDate <= seasonEndDate;
        });

    if (Array.isArray(relevantGames)) {
      relevantGames.forEach(game => { 
        const gameDate = game.date ? new Date(game.date.toDate()) : null;
        const [hours, minutes] = (game.time || '00:00').split(':').map(Number);
        const gameDateTime = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate(), hours, minutes);

        if (gameDateTime > now && (!nextGame || gameDateTime < nextGame.dateTime)) {
          const field = safeAllFieldsData.find(f => f.id === game.fieldId);
          nextGame = { ...game, fieldName: field ? field.name : 'Campo Desconhecido', dateTime: gameDateTime };
        }

        if (game.isPlayed && typeof game.scoreTeam === 'number' && typeof game.scoreOpponent === 'number') {
          numGames++;
          goalsScored += game.scoreTeam;
          goalsConceded += game.scoreOpponent;
          totalPointsDisputed += 3;

          if (game.scoreTeam > game.scoreOpponent) {
            wins++;
            totalPointsAchieved += 3;
          } else if (game.scoreTeam < game.scoreOpponent) {
            losses++;
          } else {
            draws++;
            totalPointsAchieved += 1;
          }

          (game.presence || []).forEach(p => {
            if (p.isPresent) {
              playerPresenceCount[p.playerId] = (playerPresenceCount[p.playerId] || 0) + 1;
            }
          });

          (game.playerStats || []).forEach(ps => {
            playerGoalsCount[ps.playerId] = (playerGoalsCount[ps.playerId] || 0) + (ps.goals || 0);
            if (ps.goals && ps.goals >= 3) {
              playerHatTricksCount[ps.playerId] = (playerHatTricksCount[ps.playerId] || 0) + Math.floor(ps.goals / 3);
            }
          });

          (game.highlights || []).forEach(highlightPlayerId => {
            playerHighlightsCount[highlightPlayerId] = (playerHighlightsCount[highlightPlayerId] || 0) + 1;
          });
        }
      });
    }

    const allTimeGames = safeAllGamesData.filter(game => game.isPlayed && typeof game.scoreTeam === 'number' && typeof game.scoreOpponent === 'number');

    allTimeGames.forEach(game => {
      const gameDate = game.date ? new Date(game.date.toDate()) : null;

      if (game.scoreTeam > game.scoreOpponent) {
        if (!lastWinGame || (gameDate && lastWinGame && gameDate > new Date(lastWinGame.date.toDate()))) {
          const field = safeAllFieldsData.find(f => f.id === game.fieldId);
          lastWinGame = { ...game, fieldName: field ? field.name : 'Campo Desconhecido' };
        }
      }

      const winDiff = game.scoreTeam - game.scoreOpponent;
      if (game.scoreTeam > game.scoreOpponent) {
        if (!biggestWin || winDiff > (biggestWin.scoreTeam - biggestWin.scoreOpponent)) {
          const field = safeAllFieldsData.find(f => f.id === game.fieldId);
          biggestWin = { ...game, fieldName: field ? field.name : 'Campo Desconhecido' };
        }
      }

      const lossDiff = game.scoreOpponent - game.scoreTeam;
      if (game.scoreTeam < game.scoreOpponent) {
        if (!biggestLoss || lossDiff > (biggestLoss.scoreOpponent - biggestLoss.scoreTeam)) {
          const field = safeAllFieldsData.find(f => f.id === game.fieldId);
          biggestLoss = { ...game, fieldName: field ? field.name : 'Campo Desconhecido' };
        }
      }
    });

    const performance = numGames > 0 ? ((totalPointsAchieved / totalPointsDisputed) * 100).toFixed(2) : 0;
    const goalDifference = goalsScored - goalsConceded;

    const sortedPlayersByPresence = Object.entries(playerPresenceCount)
      .map(([playerId, count]) => ({ playerId, count, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const playerGoalsAllTime = {};
    safeAllGamesData.forEach(game => {
      (game.playerStats || []).forEach(ps => {
        playerGoalsAllTime[ps.playerId] = (playerGoalsAllTime[ps.playerId] || 0) + (ps.goals || 0);
      });
    });

    let sortedPlayersByGoals = Object.entries(playerGoalsCount)
      .map(([playerId, goals]) => ({ playerId, goals, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 3);

    const allGoalsAreZeroForSeason = sortedPlayersByGoals.length > 0 && sortedPlayersByGoals.every(item => item.goals === 0);
    if (allGoalsAreZeroForSeason) {
        sortedPlayersByGoals = [];
    }

    let topScorer = Object.entries(playerGoalsAllTime)
      .map(([playerId, goals]) => ({ playerId, goals, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.goals - a.goals)[0] || null;

    if (topScorer && topScorer.goals === 0) {
        topScorer = null;
    }

    const playerHighlightsAllTime = {};
    safeAllGamesData.forEach(game => {
      (game.highlights || []).forEach(highlightPlayerId => {
        playerHighlightsAllTime[highlightPlayerId] = (playerHighlightsAllTime[highlightPlayerId] || 0) + 1;
      });
    });

    const sortedPlayersByHighlights = Object.entries(playerHighlightsCount)
      .map(([playerId, highlights]) => ({ playerId, highlights, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.highlights - a.highlights)
      .slice(0, 3);

    const allTimeTopHighlight = Object.entries(playerHighlightsAllTime)
      .map(([playerId, highlights]) => ({ playerId, highlights, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.highlights - a.highlights)[0] || null;

    const sortedPlayersBySeasonHatTricks = Object.entries(playerHatTricksCount)
      .map(([playerId, hatTricks]) => ({ playerId, hatTricks, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.hatTricks - a.hatTricks)
      .slice(0, 3);

    const playerHatTricksAllTime = {};
    safeAllGamesData.forEach(game => {
        (game.playerStats || []).forEach(ps => {
            if (ps.goals && ps.goals >= 3) {
                playerHatTricksAllTime[ps.playerId] = (playerHatTricksAllTime[ps.playerId] || 0) + Math.floor(ps.goals / 3);
            }
        });
    });
    const allTimeTopHatTrick = Object.entries(playerHatTricksAllTime)
      .map(([playerId, hatTricks]) => ({ playerId, hatTricks, player: safeAllPlayersData.find(p => p.id === playerId) }))
      .filter(item => item.player)
      .sort((a, b) => b.hatTricks - a.hatTricks)[0] || null;


    return {
      numGames, wins, losses, draws, performance, goalsScored, goalsConceded, goalDifference,
      nextGame, sortedPlayersByPresence, sortedPlayersByGoals, sortedPlayersByHighlights,
      lastWinGame, biggestWin, biggestLoss, allTimeTopScorer: topScorer, allTimeTopHighlight,
      sortedPlayersBySeasonHatTricks, allTimeTopHatTrick
    };
  }, []);

  const stats = useMemo(() => {
    return calculateStats(gamesForSelectedSeason, players, fields, selectedSeason);
  }, [gamesForSelectedSeason, players, fields, selectedSeason, calculateStats]);

  const handleSeasonChange = (event) => {
    const seasonId = event.target.value;
    const newSelectedSeason = seasons.find(s => s.id === seasonId);
    setSelectedSeason(newSelectedSeason);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] p-4 text-center">
        <Users size={60} className="text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Bem-vindo ao Craque Manager!</h2>
        <p className="text-gray-600 mb-6">Parece que ainda não cadastrou o seu time.</p>
        <button
          onClick={() => setCurrentMenu('team')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-150 ease-in-out"
        >
          Cadastrar o Meu Time Agora
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center justify-center text-center">
        {team.badge ? (
          <img src={team.badge} alt="Escudo do Time" className="w-24 h-24 object-contain mb-4 rounded-full border-2 border-gray-200" />
        ) : (
          <Zap size={60} className="text-gray-400 mb-4" />
        )}
        <h1 className="text-3xl font-extrabold text-gray-900">{team.name || "Seu Time"}</h1>
        <p className="text-sm text-gray-500 mt-1">Fundado em: {team.foundationDate ? new Date(team.foundationDate.toDate()).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}</p>
        <div className="mt-4 w-full max-w-xs">
          <label htmlFor="season-select" className="block text-gray-700 text-sm font-bold mb-2">Visualizar Temporada:</label>
          <select
            id="season-select"
            value={selectedSeason ? selectedSeason.id : 'all'}
            onChange={handleSeasonChange}
            className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
            <option value="all">Todas as Temporadas (Histórico)</option>
            {seasons.map(season => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Próximo Jogo" value={stats.nextGame ? `${stats.nextGame.opponentName}` : "Nenhum jogo futuro"}
          details={stats.nextGame ? `${new Date(stats.nextGame.date.toDate()).toLocaleDateString('pt-BR')} (${getDayOfWeek(stats.nextGame.date)}) às ${stats.nextGame.time} em ${stats.nextGame.fieldName || 'N/A'}` : null}
        />
        <StatCard title="Jogos Realizados" value={stats.numGames} />
        <StatCard title="Vitórias" value={stats.wins} />
        <StatCard title="Derrotas" value={stats.losses} />
        <StatCard title="Empates" value={stats.draws} />
        <StatCard title="Aproveitamento" value={`${stats.performance}%`} />
        <StatCard title="Golos Marcados" value={stats.goalsScored} />
        <StatCard title="Golos Sofridos" value={stats.goalsConceded} />
        <StatCard title="Saldo de Golos" value={stats.goalDifference} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlayerListCard title="Jogadores com Mais Presença (Temporada)" players={stats.sortedPlayersByPresence} statKey="count" statLabel="presenças" />
        <PlayerListCard title="Maiores Artilheiros (Temporada)" players={stats.sortedPlayersByGoals} statKey="goals" statLabel="golos" />
        <PlayerListCard title="Maiores Destaques (Temporada)" players={stats.sortedPlayersByHighlights} statKey="highlights" statLabel="destaques" />
        <PlayerListCard title="Maiores Hat Tricks (Temporada)" players={stats.sortedPlayersBySeasonHatTricks} statKey="hatTricks" statLabel="hat tricks" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RecordCard title="Última Vitória" game={stats.lastWinGame} />
        <RecordCard title="Maior Vitória" game={stats.biggestWin} />
        <RecordCard title="Maior Derrota" game={stats.biggestLoss} />
        <RecordCard title="Maior Artilheiro Histórico" player={stats.allTimeTopScorer} statKey="goals" statLabel="golos" />
        <RecordCard title="Maior Destaque Histórico" player={stats.allTimeTopHighlight} statKey="highlights" statLabel="destaques" />
        <RecordCard title="Maior Hat Trick Histórico" player={stats.allTimeTopHatTrick} statKey="hatTricks" statLabel="hat tricks" />
      </div>
    </div>
  );
};

// Componente Card para estatísticas
const StatCard = ({ title, value, details }) => (
  <div className="bg-white rounded-lg shadow-md p-4 text-center">
    <h3 className="text-md font-semibold text-gray-700">{title}</h3>
    <p className="text-3xl font-bold text-blue-600 mt-2">{value}</p>
    {details && <p className="text-xs text-gray-500 mt-1">{details}</p>}
  </div>
);

// Componente Card para lista de jogadores
const PlayerListCard = ({ title, players, statKey, statLabel }) => {
  const validPlayers = Array.isArray(players) ? players : [];
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">{title}</h3>
      {validPlayers.length > 0 ? (
        <ul className="space-y-2">
          {validPlayers.map((item, index) => (
            <li key={item.playerId} className="flex items-center justify-between text-gray-800 border-b pb-2 last:border-b-0">
              <span className="font-medium">{index + 1}. {item.player?.nickname || item.player?.name || 'Jogador Desconhecido'}</span>
              <span className="text-blue-600 font-bold">{item[statKey]} {statLabel}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-gray-500 text-sm">Nenhum jogador encontrado para esta estatística na temporada selecionada.</p>
      )}
    </div>
  );
};

// Componente Card para recordes de jogos/jogadores
const RecordCard = ({ title, game, player, statKey, statLabel }) => (
  <div className="bg-white rounded-lg shadow-md p-4">
    <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">{title}</h3>
    {game ? (
      <div className="text-center">
        <p className="text-gray-800 font-medium">{game.opponentName}</p>
        <p className="text-sm text-gray-600">{new Date(game.date.toDate()).toLocaleDateString('pt-BR')} - {game.scoreTeam} x {game.scoreOpponent}</p>
        {game.fieldName && <p className="text-xs text-gray-500">{game.fieldName}</p>}
      </div>
    ) : player ? (
      <div className="text-center">
        <p className="text-gray-800 font-medium">{player.player?.nickname || player.player?.name || 'Jogador Desconhecido'}</p>
        <p className="text-sm text-gray-600">{player[statKey]} {statLabel}</p>
      </div>
    ) : (
      <p className="text-center text-gray-500 text-sm">N/A</p>
    )}
  </div>
);


// TeamManagement.jsx
const TeamManagement = () => {
  const { db, userId, appId, showFeedback, gameTypes } = useAppContext();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [foundationDate, setFoundationDate] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [uniforms, setUniforms] = useState([]);
  const [badge, setBadge] = useState('');

  const [seasons, setSeasons] = useState([]);
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [editingSeason, setEditingSeason] = useState(null);
  const [seasonName, setSeasonName] = useState('');
  const [seasonFormStartDate, setSeasonFormStartDate] = useState('');
  const [seasonFormEndDate, setSeasonFormEndDate] = useState('');
  const [showConfirmDeleteSeasonModal, setShowConfirmDeleteSeasonModal] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState(null);
  
  // States for Game Type Management
  const [showGameTypeForm, setShowGameTypeForm] = useState(false);
  const [editingGameType, setEditingGameType] = useState(null);
  const [gameTypeName, setGameTypeName] = useState('');
  const [showConfirmDeleteGameTypeModal, setShowConfirmDeleteGameTypeModal] = useState(false);
  const [gameTypeToDelete, setGameTypeToDelete] = useState(null);


  useEffect(() => {
    if (!db || !userId || !appId) return;

    setLoading(true);
    const teamCollectionRef = collection(db, `artifacts/${appId}/public/data/teams`);
    const q = query(teamCollectionRef, where("userId", "==", userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const teamDoc = snapshot.docs[0];
        const teamData = { id: teamDoc.id, ...teamDoc.data() };
        setTeam(teamData);
        setTeamName(teamData.name || '');
        setFoundationDate(teamData.foundationDate ? new Date(teamData.foundationDate.toDate()).toISOString().split('T')[0] : '');
        setState(teamData.state || '');
        setCity(teamData.city || '');
        setAdminName(teamData.adminName || '');
        setAdminPhone(teamData.adminPhone ? formatPhoneNumber(teamData.adminPhone) : '');
        setUniforms(teamData.uniforms || []);
        setBadge(teamData.badge || '');
      } else {
        setTeam(null);
        setTeamName('');
        setFoundationDate('');
        setState('');
        setCity('');
        setAdminName('');
        setAdminPhone('');
        setUniforms([]);
        setBadge('');
      }
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar dados do time:", error);
      setTeam(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, userId, appId]);

  useEffect(() => {
    if (!db || !userId || !appId) return;
    const seasonsColRef = collection(db, `artifacts/${appId}/users/${userId}/seasons`);
    const qSeasons = query(seasonsColRef, where("userId", "==", userId));
    const unsubscribeSeasons = onSnapshot(qSeasons, (snapshot) => {
      const fetchedSeasons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSeasons(fetchedSeasons);
    }, (error) => {
      console.error("Erro ao buscar temporadas para gestão:", error);
      setSeasons([]);
    });
    return () => unsubscribeSeasons();
  }, [db, userId, appId]);


  const handleSaveTeam = async (e) => {
      e.preventDefault();
      if (!teamName || !state || !city || !adminName || !adminPhone) {
          showFeedback('Erro ao Salvar', 'Por favor, preencha todos os campos obrigatórios.', 'error');
          return;
      }

      setLoading(true);
      try {
          const teamData = {
              name: teamName,
              foundationDate: foundationDate ? new Date(foundationDate) : null,
              state,
              city,
              adminName,
              adminPhone: adminPhone.replace(/\D/g, ''),
              uniforms,
              badge,
              userId,
          };

          if (team) {
              const teamDocRef = doc(db, `artifacts/${appId}/public/data/teams`, team.id);
              await updateDoc(teamDocRef, teamData);
              showFeedback('Sucesso!', 'Time atualizado com sucesso!', 'success');
          } else {
              const newTeamRef = collection(db, `artifacts/${appId}/public/data/teams`);
              await addDoc(newTeamRef, teamData);
              showFeedback('Sucesso!', 'Time cadastrado com sucesso!', 'success');
          }
      } catch (error) {
          console.error("Erro ao salvar time:", error);
          showFeedback('Erro ao Salvar', 'Erro ao salvar time. Verifique o console para mais detalhes.', 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleAddUniform = () => {
    const newUniformName = `Uniforme ${uniforms.length + 1}`;
    setUniforms([...uniforms, { name: newUniformName, image: '' }]);
  };

  const handleUniformImageChange = (index, base64Image) => {
    const updatedUniforms = [...uniforms];
    updatedUniforms[index].image = base64Image;
    setUniforms(updatedUniforms);
  };

  const handleRemoveUniform = (index) => {
    setUniforms(uniforms.filter((_, i) => i !== index));
  };

  const handleAddSeason = () => {
    setEditingSeason(null);
    setSeasonName('');
    const today = new Date();
    const currentYear = today.getFullYear();
    setSeasonFormStartDate(`${currentYear}-01-01`);
    setSeasonFormEndDate(`${currentYear}-12-31`);
    setShowSeasonForm(true);
  };

  const handleEditSeason = (season) => {
    setEditingSeason(season);
    setSeasonName(season.name);
    setSeasonFormStartDate(season.startDate ? new Date(season.startDate.toDate()).toISOString().split('T')[0] : '');
    setSeasonFormEndDate(season.endDate ? new Date(season.endDate.toDate()).toISOString().split('T')[0] : '');
    setShowSeasonForm(true);
  };

  const handleSaveSeason = async (e) => {
    e.preventDefault();
    if (!seasonName || !seasonFormStartDate || !seasonFormEndDate) {
      showFeedback('Erro', 'Por favor, preencha todos os campos da temporada.', 'error');
      return;
    }

    const newStartDate = new Date(seasonFormStartDate + 'T00:00:00');
    const newEndDate = new Date(seasonFormEndDate + 'T00:00:00');

    if (newStartDate > newEndDate) {
      showFeedback('Erro', 'A data de início da temporada não pode ser posterior à data de fim.', 'error');
      return;
    }

    const isOverlapping = seasons.some(s => {
      if (editingSeason && s.id === editingSeason.id) return false;
      const existingStartDate = s.startDate ? new Date(s.startDate.toDate()) : null;
      const existingEndDate = s.endDate ? new Date(s.endDate.toDate()) : null;
      return (newStartDate <= existingEndDate && newEndDate >= existingStartDate);
    });

    if (isOverlapping) {
      showFeedback('Erro', 'As datas desta temporada sobrepõem-se a uma temporada existente.', 'error');
      return;
    }

    setLoading(true);
    try {
      const seasonData = {
        name: seasonName,
        startDate: newStartDate,
        endDate: newEndDate,
        userId,
      };

      if (editingSeason) {
        const seasonRef = doc(db, `artifacts/${appId}/users/${userId}/seasons`, editingSeason.id);
        await updateDoc(seasonRef, seasonData);
        showFeedback('Sucesso!', 'Temporada atualizada com sucesso!', 'success');
      } else {
        const seasonsColRef = collection(db, `artifacts/${appId}/users/${userId}/seasons`);
        await addDoc(seasonsColRef, seasonData);
        showFeedback('Sucesso!', 'Temporada cadastrada com sucesso!', 'success');
      }
      setShowSeasonForm(false);
      setEditingSeason(null);
    } catch (error) {
      console.error("Erro ao salvar temporada:", error);
      showFeedback('Erro', 'Erro ao salvar temporada. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteSeason = (season) => {
    setSeasonToDelete(season);
    showFeedback(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir a temporada "${season.name}"? Todos os jogos associados a esta temporada PERDERÃO a sua associação e não serão mais visíveis nas estatísticas filtradas por temporada. Esta ação não pode ser desfeita.`,
      'confirm',
      () => handleDeleteSeason(season),
      () => setShowConfirmDeleteSeasonModal(false)
    );
    setShowConfirmDeleteSeasonModal(true);
  };

  const handleDeleteSeason = async (seasonToDeleteFromModal) => {
    setShowConfirmDeleteSeasonModal(false);
    setLoading(true);
    try {
      const seasonIdToDelete = seasonToDeleteFromModal?.id;
      if (seasonIdToDelete) {
        const gamesQuery = query(collection(db, `artifacts/${appId}/users/${userId}/games`), where("seasonId", "==", seasonIdToDelete));
        const gamesSnapshot = await getDocs(gamesQuery);
        const batch = writeBatch(db);
        gamesSnapshot.docs.forEach(gameDoc => {
          batch.update(gameDoc.ref, { seasonId: null });
        });
        await batch.commit();

        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/seasons`, seasonIdToDelete));
        showFeedback('Sucesso!', 'Temporada excluída com sucesso! Jogos associados foram desvinculados.', 'success');
        setSeasonToDelete(null);
      } else {
        showFeedback('Erro', 'Nenhuma temporada selecionada para exclusão. Tente novamente.', 'error');
      }
    } catch (error) {
      console.error("Erro ao excluir temporada:", error);
      showFeedback('Erro', 'Erro ao excluir temporada. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddGameType = () => {
    setEditingGameType(null);
    setGameTypeName('');
    setShowGameTypeForm(true);
  };

  const handleEditGameType = (gameType) => {
    setEditingGameType(gameType);
    setGameTypeName(gameType.name);
    setShowGameTypeForm(true);
  };

  const handleSaveGameType = async (e) => {
    e.preventDefault();
    if (!gameTypeName) {
      showFeedback('Erro', 'O nome do tipo de jogo é obrigatório.', 'error');
      return;
    }

    setLoading(true);
    try {
      const gameTypeData = { name: gameTypeName, userId };

      if (editingGameType) {
        const gameTypeRef = doc(db, `artifacts/${appId}/users/${userId}/gameTypes`, editingGameType.id);
        await updateDoc(gameTypeRef, gameTypeData);
        showFeedback('Sucesso!', 'Tipo de jogo atualizado com sucesso!', 'success');
      } else {
        const gameTypesColRef = collection(db, `artifacts/${appId}/users/${userId}/gameTypes`);
        await addDoc(gameTypesColRef, { ...gameTypeData, isDefault: false });
        showFeedback('Sucesso!', 'Tipo de jogo cadastrado com sucesso!', 'success');
      }
      setShowGameTypeForm(false);
      setEditingGameType(null);
    } catch (error) {
      console.error("Erro ao salvar tipo de jogo:", error);
      showFeedback('Erro', 'Erro ao salvar tipo de jogo. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteGameType = (gameType) => {
    setGameTypeToDelete(gameType);
    showFeedback(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir o tipo de jogo "${gameType.name}"? Esta ação não pode ser desfeita.`,
      'confirm',
      () => handleDeleteGameType(gameType),
      () => setShowConfirmDeleteGameTypeModal(false)
    );
    setShowConfirmDeleteGameTypeModal(true);
  };

  const handleDeleteGameType = async (gameTypeToDeleteFromModal) => {
    setShowConfirmDeleteGameTypeModal(false);
    if (!gameTypeToDeleteFromModal || gameTypeToDeleteFromModal.isDefault) {
      showFeedback('Erro', 'Não é possível excluir um tipo de jogo padrão.', 'error');
      return;
    }
    setLoading(true);
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/gameTypes`, gameTypeToDeleteFromModal.id));
      showFeedback('Sucesso!', 'Tipo de jogo excluído com sucesso!', 'success');
      setGameTypeToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir tipo de jogo:", error);
      showFeedback('Erro', 'Erro ao excluir tipo de jogo. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md max-w-xl mx-auto divide-y divide-gray-200">
      <div className="pb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Cadastro do Time</h2>
        <form onSubmit={handleSaveTeam} className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="teamName">Nome do Time <span className="text-red-500">*</span></label>
            <input type="text" id="teamName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="foundationDate">Data de Fundação</label>
            <input type="date" id="foundationDate" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={foundationDate} onChange={(e) => setFoundationDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="state">Estado (UF) <span className="text-red-500">*</span></label>
            <select id="state" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={state} onChange={(e) => { setState(e.target.value); setCity(''); }} required>
              <option value="">Selecione um Estado</option>
              {states.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="city">Cidade <span className="text-red-500">*</span></label>
            <select id="city" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={city} onChange={(e) => setCity(e.target.value)} required disabled={!state}>
              <option value="">Selecione uma Cidade</option>
              {state && citiesByState[state]?.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="adminName">Nome do Administrador <span className="text-red-500">*</span></label>
            <input type="text" id="adminName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="adminPhone">Telefone Celular do Administrador <span className="text-red-500">*</span></label>
            <input type="tel" id="adminPhone" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={adminPhone} onChange={(e) => setAdminPhone(formatPhoneNumber(e.target.value))} required />
          </div>

          <ImageUpload label="Escudo do Time (Opcional)" onImageChange={setBadge} currentImage={badge} />

          <div className="border-t pt-4 mt-4">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Uniformes</h3>
            {uniforms.map((uniform, index) => (
              <div key={index} className="flex items-center space-x-3 mb-4 p-3 border rounded-md bg-gray-50">
                <input type="text" value={uniform.name} onChange={(e) => { const updatedUniforms = [...uniforms]; updatedUniforms[index].name = e.target.value; setUniforms(updatedUniforms); }} className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline flex-1" placeholder={`Uniforme ${index + 1}`} />
                <ImageUpload label="" onImageChange={(image) => handleUniformImageChange(index, image)} currentImage={uniform.image} />
                <button type="button" onClick={() => handleRemoveUniform(index)} className="bg-red-500 hover:bg-red-600 text-white font-bold p-2 rounded-full shadow-sm transition duration-150 ease-in-out">
                  <Zap size={18} />
                </button>
              </div>
            ))}
            <button type="button" onClick={handleAddUniform} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out w-full">
              Adicionar Uniforme
            </button>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out">
            Salvar Time
          </button>
        </form>
      </div>

      <div className="py-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Gestão de Tipos de Jogo</h3>
        <button onClick={handleAddGameType} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out w-full mb-4">
          Adicionar Novo Tipo de Jogo
        </button>
        {gameTypes.length === 0 ? (<p className="text-center text-gray-500">Nenhum tipo de jogo cadastrado.</p>) : (
          <div className="space-y-3">
            {gameTypes.map(gt => (
              <div key={gt.id} className="bg-gray-50 rounded-lg p-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center">
                  <p className="font-semibold text-gray-800">{gt.name}</p>
                  {gt.isDefault && <ShieldCheck size={16} className="text-green-600 ml-2" title="Tipo Padrão" />}
                </div>
                {!gt.isDefault && (
                  <div className="flex space-x-2">
                    <button onClick={() => handleEditGameType(gt)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded-md text-xs transition duration-150 ease-in-out">Editar</button>
                    <button onClick={() => confirmDeleteGameType(gt)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-md text-xs transition duration-150 ease-in-out">Excluir</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Gestão de Temporadas</h3>
        <button onClick={handleAddSeason} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out w-full mb-4">
          Adicionar Nova Temporada
        </button>

        {seasons.length === 0 ? (
          <p className="text-center text-gray-500">Nenhuma temporada cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {seasons.map(season => (
              <div key={season.id} className="bg-gray-50 rounded-lg p-3 flex justify-between items-center shadow-sm">
                <div>
                  <p className="font-semibold text-gray-800">{season.name}</p>
                  <p className="text-sm text-gray-600">
                    {season.startDate ? new Date(season.startDate.toDate()).toLocaleDateString('pt-BR') : 'N/A'} -{' '}
                    {season.endDate ? new Date(season.endDate.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => handleEditSeason(season)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded-md text-xs transition duration-150 ease-in-out">Editar</button>
                  <button onClick={() => confirmDeleteSeason(season)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-md text-xs transition duration-150 ease-in-out">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal show={showSeasonForm} title={editingSeason ? 'Editar Temporada' : 'Adicionar Nova Temporada'} onConfirm={handleSaveSeason} onCancel={() => setShowSeasonForm(false)} confirmText="Salvar Temporada">
        <form className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="seasonName">Nome da Temporada</label>
            <input type="text" id="seasonName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="Ex: Temporada 2024" />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="seasonFormStartDate">Data de Início</label>
            <input type="date" id="seasonFormStartDate" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={seasonFormStartDate} onChange={(e) => { setSeasonFormStartDate(e.target.value); const start = e.target.value; const end = seasonFormEndDate; if (start && end) { const startDateObj = new Date(start + 'T00:00:00'); const endDateObj = new Date(end + 'T00:00:00'); setSeasonName(`${startDateObj.toLocaleDateString('pt-BR')} - ${endDateObj.toLocaleDateString('pt-BR')}`); } }} />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="seasonFormEndDate">Data de Fim</label>
            <input type="date" id="seasonFormEndDate" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={seasonFormEndDate} onChange={(e) => { setSeasonFormEndDate(e.target.value); const start = seasonFormStartDate; const end = e.target.value; if (start && end) { const startDateObj = new Date(start + 'T00:00:00'); const endDateObj = new Date(end + 'T00:00:00'); setSeasonName(`${startDateObj.toLocaleDateString('pt-BR')} - ${endDateObj.toLocaleDateString('pt-BR')}`); } }} />
          </div>
        </form>
      </Modal>
      
      <Modal show={showGameTypeForm} title={editingGameType ? 'Editar Tipo de Jogo' : 'Adicionar Tipo de Jogo'} onConfirm={handleSaveGameType} onCancel={() => setShowGameTypeForm(false)} confirmText="Salvar">
        <form className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="gameTypeName">Nome do Tipo de Jogo</label>
            <input type="text" id="gameTypeName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" value={gameTypeName} onChange={(e) => setGameTypeName(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal show={showConfirmDeleteSeasonModal} title="Confirmar Exclusão de Temporada" message={`Tem certeza que deseja excluir a temporada "${seasonToDelete?.name}"? Todos os jogos associados a esta temporada PERDERÃO a sua associação e não serão mais visíveis nas estatísticas filtradas por temporada. Esta ação não pode ser desfeita.`} onConfirm={() => handleDeleteSeason(seasonToDelete)} onCancel={() => setShowConfirmDeleteSeasonModal(false)} />
      
      <Modal show={showConfirmDeleteGameTypeModal} title="Confirmar Exclusão de Tipo de Jogo" message={`Tem certeza que deseja excluir o tipo de jogo "${gameTypeToDelete?.name}"?`} onConfirm={() => handleDeleteGameType(gameTypeToDelete)} onCancel={() => setShowConfirmDeleteGameTypeModal(false)} />
    </div>
  );
};

// PlayerManagement.jsx
const PlayerManagement = () => {
  const { db, userId, appId, showFeedback, seasons, selectedSeason, setSelectedSeason, games, players } = useAppContext(); 
  const [loading, setLoading] = useState(false);
  const [showAddPlayerForm, setShowAddPlayerForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [rg, setRg] = useState('');
  const [cpf, setCpf] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [playerPhoto, setPlayerPhoto] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState(null);

  const [filterOption, setFilterOption] = useState('name');
  
  const calculatePlayerStats = useCallback((player) => {
    let gamesPlayed = 0, goals = 0, yellowCards = 0, redCards = 0, wins = 0, losses = 0, draws = 0, highlights = 0, hatTricks = 0, totalPointsAchieved = 0, totalPointsDisputed = 0;

    const filteredGames = games.filter(game => {
      const isSeasonMatch = selectedSeason ? (selectedSeason.id === 'all' || game.seasonId === selectedSeason.id) : true;
      return game.isPlayed && isSeasonMatch;
    });

    filteredGames.forEach(game => {
      if ((game.presence || []).some(p => p.playerId === player.id && p.isPresent)) {
        gamesPlayed++;
        totalPointsDisputed += 3;

        const playerGameStats = (game.playerStats || []).find(ps => ps.playerId === player.id);
        if (playerGameStats) {
          goals += playerGameStats.goals || 0;
          yellowCards += playerGameStats.yellowCards || 0;
          redCards += playerGameStats.redCards || 0;
          if (playerGameStats.goals && playerGameStats.goals >= 3) {
            hatTricks += Math.floor(playerGameStats.goals / 3);
          }
        }

        if (game.scoreTeam > game.scoreOpponent) {
          wins++;
          totalPointsAchieved += 3;
        } else if (game.scoreTeam < game.scoreOpponent) {
          losses++;
        } else {
          draws++;
          totalPointsAchieved += 1;
        }

        if ((game.highlights || []).includes(player.id)) {
          highlights++;
        }
      }
    });

    const performance = gamesPlayed > 0 ? ((totalPointsAchieved / totalPointsDisputed) * 100).toFixed(2) : 0;
    return { gamesPlayed, goals, yellowCards, redCards, wins, losses, draws, highlights, hatTricks, performance };
  }, [games, selectedSeason]);

  const sortedAndFilteredPlayers = useMemo(() => {
    let playersWithStats = players.map(p => ({ ...p, stats: calculatePlayerStats(p) }));
    
    switch (filterOption) {
      case 'name':
        return playersWithStats.sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name));
      case 'goals':
        return playersWithStats.sort((a, b) => (b.stats.goals || 0) - (a.stats.goals || 0));
      case 'games':
        return playersWithStats.sort((a, b) => (b.stats.gamesPlayed || 0) - (a.stats.gamesPlayed || 0));
      // Adicionar mais casos de ordenação conforme necessário
      default:
        return playersWithStats;
    }
  }, [players, filterOption, calculatePlayerStats]);

  const handleAddPlayer = () => {
    setEditingPlayer(null);
    setPlayerName('');
    setNickname('');
    setDateOfBirth('');
    setJerseyNumber('');
    setRg('');
    setCpf('');
    setPhoneNumber('');
    setPlayerPhoto('');
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    setCreatedAt(`${year}-${month}-${day}`);
    setShowAddPlayerForm(true);
  };

  const handleEditPlayer = (player) => {
    setEditingPlayer(player);
    setPlayerName(player.name);
    setNickname(player.nickname || '');
    if (player.dateOfBirth) {
      const dobDate = player.dateOfBirth.toDate();
      const year = dobDate.getFullYear();
      const month = (dobDate.getMonth() + 1).toString().padStart(2, '0');
      const day = dobDate.getDate().toString().padStart(2, '0');
      setDateOfBirth(`${year}-${month}-${day}`);
    } else {
      setDateOfBirth('');
    }
    setJerseyNumber(player.jerseyNumber || '');
    setRg(player.rg || '');
    setCpf(player.cpf || '');
    setPhoneNumber(player.phoneNumber || '');
    setPlayerPhoto(player.photo || '');
    if (player.createdAt) {
      const createdAtDate = player.createdAt.toDate();
      const year = createdAtDate.getFullYear();
      const month = (createdAtDate.getMonth() + 1).toString().padStart(2, '0');
      const day = createdAtDate.getDate().toString().padStart(2, '0');
      setCreatedAt(`${year}-${month}-${day}`);
    } else {
      setCreatedAt('');
    }
    setShowAddPlayerForm(true);
  };

  const handleSavePlayer = async (e) => {
    e.preventDefault();
    if (!playerName) {
      showFeedback('Erro ao Salvar', 'O nome do jogador é obrigatório.', 'error');
      return;
    }
    if (jerseyNumber !== '' && parseInt(jerseyNumber) < 0) {
      showFeedback('Erro ao Salvar', 'O número da camisa não pode ser negativo.', 'error');
      return;
    }

    setLoading(true);
    try {
      const playerCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/players`);
      const q = query(playerCollectionRef, where("jerseyNumber", "==", parseInt(jerseyNumber)));
      const querySnapshot = await getDocs(q);
      
      const isDuplicate = !querySnapshot.empty && querySnapshot.docs.some(doc => doc.id !== editingPlayer?.id);

      if (isDuplicate) {
        showFeedback('Erro ao Salvar', 'Este número de camisa já está em uso.', 'error');
        setLoading(false);
        return;
      }
      
      const playerDocData = {
        name: playerName,
        nickname: nickname || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth + 'T00:00:00') : null,
        jerseyNumber: jerseyNumber !== '' ? parseInt(jerseyNumber) : null,
        rg: rg || null,
        cpf: cpf || null,
        phoneNumber: phoneNumber ? phoneNumber.replace(/\D/g, '') : null,
        photo: playerPhoto || null,
        isActive: true,
        createdAt: createdAt ? new Date(createdAt + 'T00:00:00') : new Date(),
      };

      if (editingPlayer) {
        const playerRef = doc(db, `artifacts/${appId}/users/${userId}/players`, editingPlayer.id);
        await updateDoc(playerRef, playerDocData);
        showFeedback('Sucesso!', 'Jogador atualizado com sucesso!', 'success');
      } else {
        await addDoc(playerCollectionRef, playerDocData);
        showFeedback('Sucesso!', 'Jogador cadastrado com sucesso!', 'success');
      }
      setShowAddPlayerForm(false);
      setEditingPlayer(null);
    } catch (error) {
      console.error("Erro ao salvar jogador:", error);
      showFeedback('Erro ao Salvar', 'Erro ao salvar jogador. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletePlayer = (player) => {
    setPlayerToDelete(player);
    showFeedback(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir o jogador ${player?.nickname || player?.name}? Esta ação não pode ser desfeita.`,
      'confirm',
      () => handleDeletePlayer(player),
      () => showFeedback('Ação Cancelada', 'A exclusão do jogador foi cancelada.', 'info')
    );
  };

  const handleDeletePlayer = async (playerToDeleteFromModal) => {
    setLoading(true);
    try {
      if (playerToDeleteFromModal?.id) {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/players`, playerToDeleteFromModal.id));
        showFeedback('Sucesso!', 'Jogador excluído com sucesso!', 'success');
        setPlayerToDelete(null);
      }
    } catch (error) {
      console.error("Erro ao excluir jogador:", error);
      showFeedback('Erro ao Excluir', 'Erro ao excluir jogador. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (player) => {
    setLoading(true);
    try {
      const playerRef = doc(db, `artifacts/${appId}/users/${userId}/players`, player.id);
      await updateDoc(playerRef, { isActive: !player.isActive });
      showFeedback('Sucesso!', `Jogador ${player.isActive ? 'inativado' : 'ativado'} com sucesso!`, 'success');
    } catch (error) {
      console.error("Erro ao alterar status do jogador:", error);
      showFeedback('Erro ao Alterar Status', 'Erro ao alterar status do jogador. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Gestão de Jogadores</h2>

      {!showAddPlayerForm ? (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            <button onClick={handleAddPlayer} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out w-full sm:w-auto">
              Adicionar Novo Jogador
            </button>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <label htmlFor="filter" className="text-gray-700 text-sm font-bold">Ordenar por:</label>
              <select id="filter" value={filterOption} onChange={(e) => setFilterOption(e.target.value)} className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-full sm:w-auto">
                <option value="name">Nome (A-Z)</option>
                <option value="games">Jogos</option>
                <option value="goals">Golos</option>
              </select>
              <label htmlFor="season" className="text-gray-700 text-sm font-bold mt-2 sm:mt-0 sm:ml-4">Temporada:</label>
              <select id="season" value={selectedSeason ? selectedSeason.id : 'all'} onChange={(e) => { const newSeason = seasons.find(s => s.id === e.target.value) || { id: 'all', name: 'Todas as Temporadas (Histórico)' }; setSelectedSeason(newSeason); }} className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-full sm:w-auto">
                <option value="all">Todas as Temporadas (Histórico)</option>
                {seasons.map(season => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            </div>
          </div>

          {players.length === 0 ? (
            <p className="text-center text-gray-500 mt-8">Nenhum jogador cadastrado.</p>
          ) : (
            <div className="space-y-4">
              {sortedAndFilteredPlayers.map(player => (
                <div key={player.id} className="bg-white rounded-lg shadow-md p-4 flex flex-col sm:flex-row items-center sm:items-start space-y-3 sm:space-y-0 sm:space-x-4">
                  {player.photo ? (
                    <img src={player.photo} alt={player.nickname || player.name} className="w-20 h-20 object-cover rounded-full border-2 border-gray-200" />
                  ) : (
                    <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-4xl font-bold">
                      {(player.nickname || player.name) ? (player.nickname || player.name)[0].toUpperCase() : '?'}
                    </div>
                  )}
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-xl font-bold text-gray-900">
                      {player.nickname || player.name} {player.jerseyNumber ? `(#${player.jerseyNumber})` : ''}
                      {!player.isActive && <span className="text-red-500 text-sm ml-2">(Inativo)</span>}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Desde: {player.createdAt ? new Date(player.createdAt.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                      {player.createdAt && (<span className="ml-2">({calculateTimeSince(player.createdAt)})</span>)}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-sm text-gray-700">
                      <span>Jogos: <span className="font-semibold">{player.stats?.gamesPlayed || 0}</span></span>
                      <span>Golos: <span className="font-semibold">{player.stats?.goals || 0}</span></span>
                      <span>Amarelos: <span className="font-semibold">{player.stats?.yellowCards || 0}</span></span>
                      <span>Vermelhos: <span className="font-semibold">{player.stats?.redCards || 0}</span></span>
                      <span>Vitórias: <span className="font-semibold">{player.stats?.wins || 0}</span></span>
                      <span>Derrotas: <span className="font-semibold">{player.stats?.losses || 0}</span></span>
                      <span>Empates: <span className="font-semibold">{player.stats?.draws || 0}</span></span>
                      <span>Destaques: <span className="font-semibold">{player.stats?.highlights || 0}</span></span>
                      <span>Hat Tricks: <span className="font-semibold">{player.stats?.hatTricks || 0}</span></span>
                      <span className="col-span-2">Aproveitamento: <span className="font-semibold">{player.stats?.performance || 0}%</span></span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center sm:justify-end gap-2 mt-3 sm:mt-0">
                    <button onClick={() => handleEditPlayer(player)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Editar</button>
                    <button onClick={() => handleToggleActive(player)} className={`font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out ${player.isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}>
                      {player.isActive ? 'Inativar' : 'Ativar'}
                    </button>
                    <button onClick={() => confirmDeletePlayer(player)} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-4 max-w-md mx-auto">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{editingPlayer ? 'Editar Jogador' : 'Adicionar Novo Jogador'}</h3>
          <form onSubmit={handleSavePlayer} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="playerName">Nome do Jogador <span className="text-red-500">*</span></label>
              <input type="text" id="playerName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={playerName} onChange={(e) => setPlayerName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="nickname">Apelido</label>
              <input type="text" id="nickname" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="dateOfBirth">Data de Nascimento</label>
              <input type="date" id="dateOfBirth" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="jerseyNumber">Número da Camisa</label>
              <input type="number" id="jerseyNumber" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)} min="0" />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="rg">RG</label>
              <input type="text" id="rg" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={rg} onChange={(e) => setRg(e.target.value)} />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="cpf">CPF</label>
              <input type="text" id="cpf" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="phoneNumber">Número Celular</label>
              <input type="tel" id="phoneNumber" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={phoneNumber} onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))} />
            </div>
            <ImageUpload label="Foto do Jogador (Opcional)" onImageChange={setPlayerPhoto} currentImage={playerPhoto} />
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="createdAt">Jogador Desde</label>
              <input type="date" id="createdAt" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={() => setShowAddPlayerForm(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">Cancelar</button>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">Salvar Jogador</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};


// FieldManagement.jsx
const FieldManagement = () => {
  const { db, userId, appId, showFeedback, games, fields } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [fieldName, setFieldName] = useState('');
  const [fieldPhone, setFieldPhone] = useState('');
  const [fieldAddress, setFieldAddress] = useState('');
  const [editingField, setEditingField] = useState(null);

  const calculateFieldStats = useCallback((fieldId) => {
    let numGames = 0, wins = 0, losses = 0, draws = 0, performance = 0, totalPointsAchieved = 0, totalPointsDisputed = 0;

    games.forEach(game => {
      if (game.fieldId === fieldId && game.isPlayed && typeof game.scoreTeam === 'number' && typeof game.scoreOpponent === 'number') {
        numGames++;
        totalPointsDisputed += 3;
        if (game.scoreTeam > game.scoreOpponent) {
          wins++;
          totalPointsAchieved += 3;
        } else if (game.scoreTeam < game.scoreOpponent) {
          losses++;
        } else {
          draws++;
          totalPointsAchieved += 1;
        }
      }
    });

    performance = numGames > 0 ? ((totalPointsAchieved / totalPointsDisputed) * 100).toFixed(0) : 0;
    return { numGames, wins, losses, draws, performance };
  }, [games]);

  const handleSaveField = async (e, onComplete) => {
    e.preventDefault();
    if (!fieldName) {
      showFeedback('Erro ao Salvar', 'O nome do campo é obrigatório.', 'error');
      return;
    }

    setLoading(true);
    try {
      const fieldData = { name: fieldName, phone: fieldPhone || null, address: fieldAddress || null, userId };
      if (editingField) {
        const fieldRef = doc(db, `artifacts/${appId}/public/data/fields`, editingField.id);
        await updateDoc(fieldRef, fieldData);
        showFeedback('Sucesso!', 'Campo atualizado com sucesso!', 'success');
      } else {
        const fieldsCollectionRef = collection(db, `artifacts/${appId}/public/data/fields`);
        const newDocRef = await addDoc(fieldsCollectionRef, fieldData);
        showFeedback('Sucesso!', 'Campo cadastrado com sucesso!', 'success');
        if (onComplete) onComplete(newDocRef.id);
      }
      setFieldName('');
      setFieldPhone('');
      setFieldAddress('');
      setEditingField(null);
    } catch (error) {
      console.error("Erro ao salvar campo:", error);
      showFeedback('Erro ao Salvar', 'Erro ao salvar campo. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEditField = (field) => {
    setEditingField(field);
    setFieldName(field.name);
    setFieldPhone(formatPhoneNumber(field.phone));
    setFieldAddress(field.address || '');
  };

  const confirmDeleteField = (field) => {
    showFeedback(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir o campo ${field?.name}? Esta ação não pode ser desfeita.`,
      'confirm',
      () => handleDeleteField(field),
      () => {}
    );
  };
  
  const handleDeleteField = async (fieldToDelete) => {
    setLoading(true);
    try {
      if (fieldToDelete?.id) {
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/fields`, fieldToDelete.id));
        showFeedback('Sucesso!', 'Campo excluído com sucesso!', 'success');
      }
    } catch (error) {
      console.error("Erro ao excluir campo:", error);
      showFeedback('Erro ao Excluir', 'Erro ao excluir campo. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const navigateToMaps = (address) => {
    if (address) {
      const encodedAddress = encodeURIComponent(address);
      window.open(`https://maps.google.com/maps?q=${encodedAddress}`, '_system');
    } else {
      showFeedback('Erro', 'Endereço não disponível para navegação.', 'error');
    }
  };
  
  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Gestão de Campos</h2>
      <div className="bg-white rounded-lg shadow-md p-4 max-w-md mx-auto mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{editingField ? 'Editar Campo' : 'Adicionar Novo Campo'}</h3>
        <form onSubmit={handleSaveField} className="space-y-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="fieldName">Nome do Campo <span className="text-red-500">*</span></label>
            <input type="text" id="fieldName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={fieldName} onChange={(e) => setFieldName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="fieldPhone">Telefone</label>
            <input type="tel" id="fieldPhone" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={fieldPhone} onChange={(e) => setFieldPhone(formatPhoneNumber(e.target.value))} />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="fieldAddress">Endereço</label>
            <input type="text" id="fieldAddress" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={fieldAddress} onChange={(e) => setFieldAddress(e.target.value)} />
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            {editingField && (
              <button type="button" onClick={() => { setEditingField(null); setFieldName(''); setFieldPhone(''); setFieldAddress(''); }} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">
                Cancelar Edição
              </button>
            )}
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">
              {editingField ? 'Atualizar Campo' : 'Adicionar Campo'}
            </button>
          </div>
        </form>
      </div>

      {fields.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum campo cadastrado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(field => {
            const fieldStats = calculateFieldStats(field.id);
            return (
              <div key={field.id} className="bg-white rounded-lg shadow-md p-4">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{field.name}</h3>
                {field.phone && <p className="text-gray-700 text-sm">Telefone: {field.phone}</p>}
                {field.address && (
                  <>
                    <p className="text-gray-700 text-sm">Endereço: {field.address}</p>
                    <div className="mt-3 rounded-md overflow-hidden border border-gray-200">
                      <iframe title={`Mapa de ${field.name}`} width="100%" height="200" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=&q=${encodeURIComponent(field.address)}`}></iframe>
                    </div>
                    <button onClick={() => navigateToMaps(field.address)} className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">
                      Navegar no Mapa
                    </button>
                  </>
                )}
                <div className="text-sm text-gray-700 mt-3 pt-3 border-t border-gray-200">
                  {fieldStats.numGames > 0 ? (
                    <p>Histórico: ({fieldStats.numGames} J, {fieldStats.wins} V, {fieldStats.losses} D, {fieldStats.draws} E, {fieldStats.performance}% aprov.)</p>
                  ) : (
                    <p className="text-gray-500">Nenhum jogo registado neste campo.</p>
                  )}
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  <button onClick={() => handleEditField(field)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Editar</button>
                  <button onClick={() => confirmDeleteField(field)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// GameManagement.jsx
const GameManagement = () => {
  const { db, userId, appId, showFeedback, seasons, team, games, players, fields, gameTypes } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [showAddGameForm, setShowAddGameForm] = useState(false);
  const [editingGame, setEditingGame] = useState(null);

  // Form states
  const [selectedGameTypeId, setSelectedGameTypeId] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [gameTime, setGameTime] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [opponentBadge, setOpponentBadge] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [selectedUniformName, setSelectedUniformName] = useState('');

  // Modal states
  const [currentGameDetail, setCurrentGameDetail] = useState(null);
  const [showConfirmDeleteGameModal, setShowConfirmDeleteGameModal] = useState(false);
  const [gameToDelete, setGameToDelete] = useState(null);
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const [presenceList, setPresenceList] = useState([]);
  const [showGameDataModal, setShowGameDataModal] = useState(false);
  const [scoreTeam, setScoreTeam] = useState('');
  const [scoreOpponent, setScoreOpponent] = useState('');
  const [playerGameStats, setPlayerGameStats] = useState({});
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [selectedHighlights, setSelectedHighlights] = useState([]);
  const [showFieldMapPopup, setShowFieldMapPopup] = useState(false);
  const [fieldMapAddress, setFieldMapAddress] = useState('');
  const [fieldMapName, setFieldMapName] = useState('');
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);
  const [imagePreviewSrc, setImagePreviewSrc] = useState('');
  const [imagePreviewTitle, setImagePreviewTitle] = useState('');
  const [showAddNewFieldModal, setShowAddNewFieldModal] = useState(false);

  // Estados para o formulário de novo campo dentro do modal
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldPhone, setNewFieldPhone] = useState('');
  const [newFieldAddress, setNewFieldAddress] = useState('');


  const formatDate = (date) => date ? new Date(date.toDate()).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A';
  
  const getDayOfWeek = (dateInput) => {
    if (!dateInput) return '';
    let dateObj;
    if (dateInput && typeof dateInput.toDate === 'function') { // Handle Firestore Timestamp
      dateObj = dateInput.toDate();
    } else if (typeof dateInput === 'string' && dateInput.includes('-')) { // Handle 'YYYY-MM-DD' string
      dateObj = new Date(dateInput + 'T00:00:00');
    } else if (dateInput instanceof Date) { // Handle JS Date object
      dateObj = dateInput;
    } else {
      return ''; // Invalid input
    }
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return days[dateObj.getUTCDay()];
  };

  const sortedGames = useMemo(() => [...games].sort((a, b) => {
    const dateA = new Date(a.date.toDate());
    const dateB = new Date(b.date.toDate());
    const now = new Date();
    const isFutureA = dateA >= now;
    const isFutureB = dateB >= now;
    if (isFutureA && !isFutureB) return -1;
    if (!isFutureA && isFutureB) return 1;
    return dateA.getTime() - dateB.getTime();
  }), [games]);

  const handleAddNewFieldFromGame = async (e) => {
    e.preventDefault();
    if (!newFieldName) {
      showFeedback('Erro', 'O nome do campo é obrigatório.', 'error');
      return;
    }
    setLoading(true);
    try {
      const fieldData = { name: newFieldName, phone: newFieldPhone || null, address: newFieldAddress || null, userId };
      const fieldsCollectionRef = collection(db, `artifacts/${appId}/public/data/fields`);
      const newDocRef = await addDoc(fieldsCollectionRef, fieldData);
      showFeedback('Sucesso!', 'Campo cadastrado com sucesso!', 'success');
      
      setSelectedFieldId(newDocRef.id); // Seleciona o campo recém-criado
      setShowAddNewFieldModal(false); // Fecha o modal
      // Limpa os campos do formulário do modal
      setNewFieldName('');
      setNewFieldPhone('');
      setNewFieldAddress('');

    } catch (error) {
      console.error("Erro ao salvar novo campo:", error);
      showFeedback('Erro', 'Não foi possível salvar o novo campo.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleFieldSelectionChange = (e) => {
    const value = e.target.value;
    if (value === 'addNewField') {
        setShowAddNewFieldModal(true);
    } else {
        setSelectedFieldId(value);
    }
  };


  const handleAddGame = () => {
    setEditingGame(null);
    setSelectedGameTypeId('');
    setGameDate('');
    setGameTime('');
    setOpponentName('');
    setOpponentBadge('');
    setSelectedFieldId('');
    setSelectedUniformName('');
    setShowAddGameForm(true);
  };

  const handleEditGame = (game) => {
    setEditingGame(game);
    setSelectedGameTypeId(game.gameTypeId || '');
    setGameDate(game.date ? new Date(game.date.toDate()).toISOString().split('T')[0] : '');
    setGameTime(game.time || '');
    setOpponentName(game.opponentName || '');
    setOpponentBadge(game.opponentBadge || '');
    setSelectedFieldId(game.fieldId || '');
    setSelectedUniformName(game.uniformName || '');
    setShowAddGameForm(true);
  };

  const handleSaveGame = async (e) => {
    e.preventDefault();
    if (!selectedGameTypeId || !gameDate || !gameTime || !opponentName || !selectedFieldId) {
      showFeedback('Erro ao Salvar', 'Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    const gameDateObj = new Date(gameDate + 'T00:00:00');
    const seasonForGame = seasons.find(s => {
      const startDate = s.startDate ? new Date(s.startDate.toDate()) : null;
      const endDate = s.endDate ? new Date(s.endDate.toDate()) : null;
      return startDate && endDate && gameDateObj >= startDate && gameDateObj <= endDate;
    });

    if (!seasonForGame) {
      showFeedback('Aviso', 'Nenhuma temporada encontrada para a data do jogo. O jogo será salvo sem associação a uma temporada.', 'warning');
    }

    setLoading(true);
    try {
      const gameData = {
        gameTypeId: selectedGameTypeId,
        date: new Date(gameDate + 'T00:00:00'),
        time: gameTime,
        opponentName,
        opponentBadge: opponentBadge || null,
        fieldId: selectedFieldId,
        uniformName: selectedUniformName || null,
        seasonId: seasonForGame?.id || null,
        dayOfWeek: getDayOfWeek(gameDate),
        isPlayed: editingGame?.isPlayed || false,
        scoreTeam: editingGame?.scoreTeam || null,
        scoreOpponent: editingGame?.scoreOpponent || null,
        presence: editingGame?.presence || [],
        playerStats: editingGame?.playerStats || [],
        highlights: editingGame?.highlights || [],
        userId,
      };

      if (editingGame) {
        const gameRef = doc(db, `artifacts/${appId}/users/${userId}/games`, editingGame.id);
        await updateDoc(gameRef, gameData);
        showFeedback('Sucesso!', 'Jogo atualizado com sucesso!', 'success');
      } else {
        const gamesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/games`);
        await addDoc(gamesCollectionRef, gameData);
        showFeedback('Sucesso!', 'Jogo cadastrado com sucesso!', 'success');
      }
      setShowAddGameForm(false);
      setEditingGame(null);
    } catch (error) {
      console.error("Erro ao salvar jogo:", error);
      showFeedback('Erro ao Salvar', 'Erro ao salvar jogo. Verifique o console.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteGame = (game) => {
    setGameToDelete(game);
    setShowConfirmDeleteGameModal(true);
  };

  const handleDeleteGame = async () => {
    if (!gameToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/games`, gameToDelete.id));
      showFeedback('Sucesso!', 'Jogo excluído com sucesso!', 'success');
      setShowConfirmDeleteGameModal(false);
      setGameToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir jogo:", error);
      showFeedback('Erro ao Excluir', 'Erro ao excluir jogo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openPresenceModal = (game) => {
    setCurrentGameDetail(game);
    const activePlayers = players.filter(p => p.isActive).sort((a,b) => (a.nickname || a.name).localeCompare(b.nickname || b.name));
    const initialPresence = activePlayers.map(p => {
        const existing = (game.presence || []).find(pp => pp.playerId === p.id);
        return {
          playerId: p.id,
          isPresent: existing?.isPresent || false,
          checkInTime: existing?.checkInTime || '',
          name: p.nickname || p.name,
        };
      });
    setPresenceList(initialPresence);
    setShowPresenceModal(true);
  };

  const handlePresenceChange = (playerId, isPresent) => {
    const now = new Date();
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    setPresenceList(prev =>
      prev.map(p =>
        p.playerId === playerId
          ? { ...p, isPresent, checkInTime: isPresent ? formattedTime : '' }
          : p
      )
    );
  };

  const handleManualCheckInTimeChange = (playerId, time) => {
    setPresenceList(prev =>
      prev.map(p =>
        p.playerId === playerId ? { ...p, checkInTime: time } : p
      )
    );
  };

  const savePresence = async () => {
    if (!currentGameDetail) return;
    setLoading(true);
    try {
      const gameRef = doc(db, `artifacts/${appId}/users/${userId}/games`, currentGameDetail.id);
      await updateDoc(gameRef, { presence: presenceList });
      showFeedback('Sucesso!', 'Lista de presença salva com sucesso!', 'success');
      setShowPresenceModal(false);
    } catch (error) {
      console.error("Erro ao salvar presença:", error);
      showFeedback('Erro', 'Erro ao salvar presença.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openGameDataModal = (game) => {
    setCurrentGameDetail(game);
    setScoreTeam(game.scoreTeam ?? '');
    setScoreOpponent(game.scoreOpponent ?? '');

    const presentPlayers = players.filter(p => (game.presence || []).some(gp => gp.playerId === p.id && gp.isPresent)).sort((a,b) => (a.nickname || a.name).localeCompare(b.nickname || b.name));

    const initialStats = {};
    presentPlayers.forEach(player => {
      const existingStats = (game.playerStats || []).find(ps => ps.playerId === player.id);
      initialStats[player.id] = {
        goals: existingStats?.goals || 0,
        yellowCards: existingStats?.yellowCards || 0,
        redCards: existingStats?.redCards || 0,
      };
    });
    setPlayerGameStats(initialStats);
    setShowGameDataModal(true);
  };

  const handlePlayerStatChange = (playerId, statType, value) => {
    setPlayerGameStats(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [statType]: parseInt(value) >= 0 ? parseInt(value) : 0,
      }
    }));
  };

  const saveGameData = async () => {
    if (!currentGameDetail) return;

    const totalGoals = Object.values(playerGameStats).reduce((sum, stats) => sum + (stats.goals || 0), 0);
    const teamScore = parseInt(scoreTeam) || 0;

    if (totalGoals > teamScore) {
      showFeedback('Erro', `O total de golos dos jogadores (${totalGoals}) não pode ser maior que o placar do time (${teamScore}).`, 'error');
      return;
    }
    
    setLoading(true);
    try {
      const gameRef = doc(db, `artifacts/${appId}/users/${userId}/games`, currentGameDetail.id);
      const updatedPlayerStats = Object.keys(playerGameStats).map(playerId => ({
        playerId,
        ...playerGameStats[playerId]
      }));

      await updateDoc(gameRef, {
        scoreTeam: teamScore,
        scoreOpponent: parseInt(scoreOpponent) || 0,
        isPlayed: true,
        playerStats: updatedPlayerStats,
      });
      showFeedback('Sucesso!', 'Dados do jogo salvos com sucesso!', 'success');
      setShowGameDataModal(false);
    } catch (error) {
      console.error("Erro ao salvar dados do jogo:", error);
      showFeedback('Erro', 'Erro ao salvar dados do jogo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openHighlightModal = (game) => {
    setCurrentGameDetail(game);
    setSelectedHighlights(game.highlights || []);
    setShowHighlightModal(true);
  };

  const handleHighlightChange = (playerId) => {
    setSelectedHighlights(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };
  
  const saveHighlights = async () => {
    if (!currentGameDetail) return;
    setLoading(true);
    try {
      const gameRef = doc(db, `artifacts/${appId}/users/${userId}/games`, currentGameDetail.id);
      await updateDoc(gameRef, { highlights: selectedHighlights });
      showFeedback('Sucesso!', 'Destaques salvos com sucesso!', 'success');
      setShowHighlightModal(false);
    } catch (error) {
      console.error("Erro ao salvar destaques:", error);
      showFeedback('Erro', 'Erro ao salvar destaques.', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const openFieldMapPopup = (fieldId) => {
    const field = fields.find(f => f.id === fieldId);
    if (field && field.address) {
      setFieldMapAddress(field.address);
      setFieldMapName(field.name);
      setShowFieldMapPopup(true);
    } else {
      showFeedback('Info', 'Endereço do campo não disponível.', 'info');
    }
  };

  const navigateToMapsFromPopup = () => {
    if (fieldMapAddress) {
      window.open(`https://maps.google.com/maps?q=${encodeURIComponent(fieldMapAddress)}`, '_system');
    }
    setShowFieldMapPopup(false);
  };

  const openImagePreview = (src, title) => {
    setImagePreviewSrc(src);
    setImagePreviewTitle(title);
    setShowImagePreviewModal(true);
  };

  const presentPlayersForHighlight = useMemo(() => {
    if (!currentGameDetail) return [];
    return players.filter(p => (currentGameDetail.presence || []).some(gp => gp.playerId === p.id && gp.isPresent)).sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name));
  }, [currentGameDetail, players]);
  
  const playersForGameStatsModal = useMemo(() => {
    if (!currentGameDetail) return [];
    return players.filter(p => (currentGameDetail.presence || []).some(gp => gp.playerId === p.id && gp.isPresent)).sort((a,b) => (a.nickname || a.name).localeCompare(b.nickname || b.name));
  }, [currentGameDetail, players]);

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Agenda de Jogos</h2>

      {!showAddGameForm ? (
        <>
          <div className="flex justify-center mb-4">
            <button onClick={handleAddGame} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out">
              Adicionar Novo Jogo
            </button>
          </div>

          {sortedGames.length === 0 ? (
            <p className="text-center text-gray-500 mt-8">Nenhum jogo cadastrado.</p>
          ) : (
            <div className="space-y-4">
              {sortedGames.map(game => {
                const gameField = fields.find(f => f.id === game.fieldId);
                const gameUniform = team?.uniforms?.find(u => u.name === game.uniformName);
                const isFieldDefined = game.fieldId && game.fieldId !== 'A_DEFINIR';
                const gameTypeName = gameTypes.find(gt => gt.id === game.gameTypeId)?.name || 'Não definido';

                return (
                  <div key={game.id} className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between mb-3 border-b pb-3">
                      <div className="flex items-center space-x-3">
                        {team?.badge ? (<img src={team.badge} alt="Escudo Time" className="w-12 h-12 object-contain rounded-full cursor-pointer" onClick={() => openImagePreview(team.badge, team.name)} />) : (<Zap size={30} className="text-gray-400" />)}
                        <span className="font-bold text-lg text-gray-900">{team?.name || 'Seu Time'}</span>
                      </div>
                      <span className="font-bold text-xl text-gray-800">{game.isPlayed ? `${game.scoreTeam ?? 0} x ${game.scoreOpponent ?? 0}` : 'vs.'}</span>
                      <div className="flex items-center space-x-3">
                        <span className="font-bold text-lg text-gray-900">{game.opponentName}</span>
                        {game.opponentBadge ? (<img src={game.opponentBadge} alt="Escudo Adversário" className="w-12 h-12 object-contain rounded-full cursor-pointer" onClick={() => openImagePreview(game.opponentBadge, game.opponentName)} />) : (<Zap size={30} className="text-gray-400" />)}
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 space-y-1">
                      <p className="text-center"><strong>Tipo:</strong> {gameTypeName}</p>
                      <p className="text-center"><strong>Data:</strong> {formatDate(game.date)} ({getDayOfWeek(game.date)})</p>
                      <p className="text-center"><strong>Horário:</strong> {game.time}</p>
                      <p className="text-center"><strong>Campo:</strong>
                        {isFieldDefined ? (
                          <span className="text-blue-600 cursor-pointer hover:underline" onClick={() => openFieldMapPopup(game.fieldId)}>
                            {gameField?.name || 'Campo não encontrado'}
                          </span>
                        ) : (
                          <span className="text-gray-600"> A Definir</span>
                        )}
                      </p>
                      <p className="text-left"><strong>Uniforme:</strong>
                        {gameUniform ? (
                          <span className="inline-flex items-center ml-1 cursor-pointer" onClick={() => openImagePreview(gameUniform.image, gameUniform.name)}>
                            {gameUniform.name}
                            <img src={gameUniform.image} alt={gameUniform.name} className="w-6 h-6 object-contain ml-1 rounded-full border border-gray-200" />
                          </span>
                        ) : (
                          <span>{game.uniformName || 'Não Definido'}</span>
                        )}
                      </p>
                      {game.isPlayed && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          {((game.playerStats || []).some(ps => ps.goals > 0)) && (
                            <p className="text-left text-sm">
                              <strong>Golos:</strong>{' '}
                              {(game.playerStats || []).map(ps => { const player = players.find(p => p.id === ps.playerId); if (player && ps.goals > 0) { return (<span key={ps.playerId} className="mr-2">{player.nickname || player.name} {Array(ps.goals).fill('⚽').join('')}</span>); } return null; })}
                            </p>
                          )}
                          {((game.playerStats || []).some(ps => ps.yellowCards > 0 || ps.redCards > 0)) && (
                            <p className="text-left text-sm">
                              <strong>Cartões:</strong>{' '}
                              {(game.playerStats || []).map(ps => { const player = players.find(p => p.id === ps.playerId); if (!player) return null; let cardsString = ''; if (ps.yellowCards > 0) { cardsString += ` ${Array(ps.yellowCards).fill('🟨').join('')}`; } if (ps.redCards > 0) { cardsString += ` ${Array(ps.redCards).fill('🟥').join('')}`; } return cardsString ? <span key={ps.playerId} className="mr-2">{player.nickname || player.name}{cardsString}</span> : null; })}
                            </p>
                          )}
                          {(game.highlights || []).length > 0 && (
                            <p className="text-left text-sm">
                              <strong>Destaques:</strong>{' '}
                              {(game.highlights || []).map(highlightId => { const player = players.find(p => p.id === highlightId); return player ? <span key={highlightId} className="mr-2">👑 {player.nickname || player.name}</span> : null; })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-center sm:justify-end gap-2 mt-4">
                      <button onClick={() => openPresenceModal(game)} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Presença</button>
                      <button onClick={() => openGameDataModal(game)} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Dados</button>
                      <button onClick={() => openHighlightModal(game)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Destaque</button>
                      <button onClick={() => handleEditGame(game)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Editar</button>
                      <button onClick={() => confirmDeleteGame(game)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-md text-sm shadow-sm transition duration-150 ease-in-out">Excluir</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-4 max-w-md mx-auto">
          <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{editingGame ? 'Editar Jogo' : 'Adicionar Novo Jogo'}</h3>
          <form onSubmit={handleSaveGame} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="gameType">Tipo de Jogo <span className="text-red-500">*</span></label>
              <select id="gameType" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={selectedGameTypeId} onChange={(e) => setSelectedGameTypeId(e.target.value)} required>
                  <option value="">Selecione o Tipo de Jogo</option>
                  {gameTypes.map(gt => (
                      <option key={gt.id} value={gt.id}>{gt.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="gameDate">Data da Partida <span className="text-red-500">*</span></label>
              <input type="date" id="gameDate" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={gameDate} onChange={(e) => setGameDate(e.target.value)} required />
              {gameDate && <p className="text-xs text-gray-500 mt-1">Dia da Semana: {getDayOfWeek(gameDate)}</p>}
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="gameTime">Horário <span className="text-red-500">*</span></label>
              <select id="gameTime" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={gameTime} onChange={(e) => setGameTime(e.target.value)} required>
                <option value="">Selecione ou A Definir</option>
                <option value="A Definir">A Definir</option>
                {Array.from({ length: 24 * 4 }, (_, i) => { const hours = Math.floor(i / 4).toString().padStart(2, '0'); const minutes = ((i % 4) * 15).toString().padStart(2, '0'); return `${hours}:${minutes}`; }).map(time => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="opponentName">Adversário <span className="text-red-500">*</span></label>
              <input type="text" id="opponentName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} required />
            </div>
            <ImageUpload label="Escudo do Time Adversário (Opcional)" onImageChange={setOpponentBadge} currentImage={opponentBadge} />
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="field">Campo <span className="text-red-500">*</span></label>
              <select id="field" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={selectedFieldId} onChange={handleFieldSelectionChange} required>
                <option value="">Selecione um Campo</option>
                <option value="A_DEFINIR">A Definir</option>
                {fields.map(field => (<option key={field.id} value={field.id}>{field.name}</option>))}
                <option value="addNewField">-- Adicionar Novo Campo --</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="uniform">Uniforme</label>
              <select id="uniform" className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value={selectedUniformName} onChange={(e) => setSelectedUniformName(e.target.value)}>
                <option value="">Selecione um Uniforme</option>
                {team?.uniforms?.map((uniform, index) => (<option key={index} value={uniform.name}>{uniform.name}</option>))}
              </select>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={() => setShowAddGameForm(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">Cancelar</button>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition duration-150 ease-in-out">Salvar Jogo</button>
            </div>
          </form>
        </div>
      )}

      <Modal show={showConfirmDeleteGameModal} title="Confirmar Exclusão de Jogo" message={`Tem certeza que deseja excluir o jogo contra ${gameToDelete?.opponentName} em ${formatDate(gameToDelete?.date)}? Esta ação não pode ser desfeita.`} onConfirm={handleDeleteGame} onCancel={() => setShowConfirmDeleteGameModal(false)} />

      <Modal show={showPresenceModal} title={`Lista de Presença para ${currentGameDetail?.opponentName || ''}`} onConfirm={savePresence} onCancel={() => setShowPresenceModal(false)} message={null}>
        <div className="max-h-96 overflow-y-auto pr-2">
            {players.filter(p => p.isActive).length === 0 ? (<p className="text-center text-gray-500">Nenhum jogador ativo para marcar presença.</p>) : (
                <ul className="space-y-3">
                    {players.filter(p => p.isActive).map(player => {
                        const presenceInfo = presenceList.find(pL => pL.playerId === player.id);
                        const isChecked = presenceInfo?.isPresent || false;
                        const checkInTime = presenceInfo?.checkInTime || '';
                        return (
                            <li key={player.id} className="flex items-center justify-between p-2 border-b last:border-b-0 bg-gray-50 rounded-md">
                                <div className="flex items-center">
                                    <input type="checkbox" id={`presence-${player.id}`} checked={isChecked} onChange={(e) => handlePresenceChange(player.id, e.target.checked)} className="form-checkbox h-5 w-5 text-blue-600 rounded-md" />
                                    <label htmlFor={`presence-${player.id}`} className="ml-3 text-gray-800 font-medium">{player.nickname || player.name}</label>
                                </div>
                                {isChecked && (<input type="time" value={checkInTime} onChange={(e) => handleManualCheckInTimeChange(player.id, e.target.value)} className="text-sm text-gray-600 bg-green-100 border-green-200 border rounded-md py-1 px-2 w-24" />)}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
      </Modal>

      <Modal show={showGameDataModal} title={`Dados do Jogo contra ${currentGameDetail?.opponentName || ''}`} onConfirm={saveGameData} onCancel={() => setShowGameDataModal(false)} message={null}>
        <div className="space-y-4">
          <div className="flex items-center space-x-4 mb-4">
            <label className="block text-gray-700 text-sm font-bold">Placar:</label>
            <input type="number" placeholder="Golos Time" className="shadow border rounded py-2 px-3 w-24 text-gray-700 text-sm" value={scoreTeam} onChange={(e) => setScoreTeam(e.target.value)} min="0" />
            <span className="font-bold text-lg">x</span>
            <input type="number" placeholder="Golos Adv." className="shadow border rounded py-2 px-3 w-24 text-gray-700 text-sm" value={scoreOpponent} onChange={(e) => setScoreOpponent(e.target.value)} min="0" />
          </div>
          <h4 className="text-md font-bold text-gray-800 mb-2">Estatísticas dos Jogadores Presentes:</h4>
          <div className="max-h-80 overflow-y-auto pr-2">
            {playersForGameStatsModal.length === 0 ? (<p className="text-center text-gray-500">Nenhum jogador presente para registar estatísticas.</p>) : (
              <ul className="space-y-3">
                {playersForGameStatsModal.map(player => {
                  const playerStats = playerGameStats[player.id] || { goals: 0, yellowCards: 0, redCards: 0 };
                  return (
                    <li key={player.id} className="flex flex-wrap items-center justify-between p-2 border-b last:border-b-0 bg-gray-50 rounded-md">
                      <span className="font-medium text-gray-800 w-full sm:w-auto mb-2 sm:mb-0">{player.nickname || player.name}</span>
                      <div className="flex flex-grow justify-end space-x-2">
                        <div className="flex flex-col items-center">
                          <label htmlFor={`goals-${player.id}`} className="text-xs font-semibold text-gray-600 mb-1">Golos</label>
                          <input type="number" id={`goals-${player.id}`} className="shadow border rounded py-1 px-2 w-20 text-gray-700 text-sm" value={playerStats.goals} onChange={(e) => handlePlayerStatChange(player.id, 'goals', e.target.value)} min="0" />
                        </div>
                        <div className="flex flex-col items-center">
                          <label htmlFor={`yellow-${player.id}`} className="text-xs font-semibold text-gray-600 mb-1">Amarelos</label>
                          <input type="number" id={`yellow-${player.id}`} className="shadow border rounded py-1 px-2 w-24 text-gray-700 text-sm" value={playerStats.yellowCards} onChange={(e) => handlePlayerStatChange(player.id, 'yellowCards', e.target.value)} min="0" />
                        </div>
                        <div className="flex flex-col items-center">
                          <label htmlFor={`red-${player.id}`} className="text-xs font-semibold text-gray-600 mb-1">Vermelhos</label>
                          <input type="number" id={`red-${player.id}`} className="shadow border rounded py-1 px-2 w-24 text-gray-700 text-sm" value={playerStats.redCards} onChange={(e) => handlePlayerStatChange(player.id, 'redCards', e.target.value)} min="0" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      <Modal show={showHighlightModal} title={`Escolher Destaque(s) para ${currentGameDetail?.opponentName || ''}`} onConfirm={saveHighlights} onCancel={() => setShowHighlightModal(false)} message={null}>
        <div className="max-h-96 overflow-y-auto pr-2">
          {presentPlayersForHighlight.length === 0 ? (<p className="text-center text-gray-500">Nenhum jogador presente para destaque.</p>) : (
            <ul className="space-y-3">
              {presentPlayersForHighlight.map(player => (
                <li key={player.id} className="flex items-center p-2 border-b last:border-b-0 bg-gray-50 rounded-md">
                  <input type="checkbox" id={`highlight-${player.id}`} checked={selectedHighlights.includes(player.id)} onChange={() => handleHighlightChange(player.id)} className="form-checkbox h-5 w-5 text-blue-600 rounded-md" />
                  <label htmlFor={`highlight-${player.id}`} className="ml-3 text-gray-800 font-medium">{player.nickname || player.name}</label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal show={showFieldMapPopup} title={fieldMapName} onConfirm={navigateToMapsFromPopup} onCancel={() => setShowFieldMapPopup(false)} message={null} confirmText="Navegar">
        <div className="space-y-4">
          {fieldMapAddress && (<div className="mt-3 rounded-md overflow-hidden border border-gray-200"><iframe title={`Mapa de ${fieldMapName}`} width="100%" height="200" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=&q=${encodeURIComponent(fieldMapAddress)}`}></iframe></div>)}
          <p className="text-gray-700 text-center text-sm">{fieldMapAddress}</p>
          <p className="text-center text-gray-600 text-xs">Clique em "Navegar" para abrir a aplicação de mapas do seu dispositivo.</p>
        </div>
      </Modal>

      <Modal show={showImagePreviewModal} title={imagePreviewTitle} onConfirm={() => setShowImagePreviewModal(false)} onCancel={() => setShowImagePreviewModal(false)} confirmText="Fechar">
        <div className="flex justify-center"><img src={imagePreviewSrc} alt={imagePreviewTitle} className="max-w-full h-auto rounded-md" /></div>
      </Modal>
      
      <Modal show={showAddNewFieldModal} title="Adicionar Novo Campo" onConfirm={handleAddNewFieldFromGame} onCancel={() => setShowAddNewFieldModal(false)} confirmText="Salvar Campo">
        <form onSubmit={handleAddNewFieldFromGame} className="space-y-4">
           <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="newFieldName">Nome do Campo <span className="text-red-500">*</span></label>
            <input type="text" id="newFieldName" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="newFieldPhone">Telefone</label>
            <input type="tel" id="newFieldPhone" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" value={newFieldPhone} onChange={(e) => setNewFieldPhone(formatPhoneNumber(e.target.value))} />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="newFieldAddress">Endereço</label>
            <input type="text" id="newFieldAddress" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" value={newFieldAddress} onChange={(e) => setNewFieldAddress(e.target.value)} />
          </div>
        </form>
      </Modal>

    </div>
  );
};

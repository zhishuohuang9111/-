import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './Home';
import '../../rdimm-app/app/globals.css';
import '../../rdimm-app/app/product.css';
import './windows.css';
createRoot(document.getElementById('root')!).render(<Home/>);

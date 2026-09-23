"use client";

import React, { useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

// --- Custom Nodes ---
const SystemBoundaryNode = ({ data }: any) => {
  const isDark = data.isDarkMode;
  return (
    <div className={`w-full h-full border-2 border-dashed rounded-2xl flex flex-col pointer-events-none transition-colors ${isDark ? 'border-slate-600 bg-slate-800/20' : 'border-slate-300 bg-slate-100/30'}`}>
      <div className={`text-center font-bold tracking-widest uppercase mt-4 opacity-50 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
        « System Boundary »
      </div>
    </div>
  );
};

const ActorNode = ({ data }: any) => {
  const isDark = data.isDarkMode;
  return (
    <div className="flex flex-col items-center justify-center w-[100px] relative group">
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-transparent" />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isDark ? "text-blue-400" : "text-blue-600"}>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"></path>
        <path d="M12 14c-4.42 0-8 3.58-8 8h16c0-4.42-3.58-8-8-8z"></path>
      </svg>
      <div className={`text-xs font-bold mt-2 text-center px-2 py-1 rounded shadow-sm border transition-colors ${isDark ? 'bg-slate-800 text-gray-200 border-slate-700' : 'bg-white text-gray-800'}`}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-transparent" />
    </div>
  );
};

const UseCaseNode = ({ data }: any) => {
  const isDark = data.isDarkMode;
  const darkClass = 'bg-yellow-900 border-yellow-700 text-yellow-100 shadow-yellow-900/50';
  const lightClass = 'bg-[#fef08a] border-[#eab308] text-yellow-950 shadow-sm';
  return (
    <div className={`border-2 rounded-[40px] flex items-center justify-center px-4 py-2 w-[180px] h-[70px] text-center text-sm font-semibold hover:shadow-md transition-all relative ${isDark ? darkClass : lightClass}`}>
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-transparent" />
      {data.label}
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-transparent" />
    </div>
  );
};

const nodeTypes = {
  actorNode: ActorNode,
  useCaseNode: UseCaseNode,
  systemBoundary: SystemBoundaryNode,
};

// --- Thuật toán Auto-Layout (Dagre) ---
const getLayoutedElements = (nodes: any[], edges: any[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 150 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 70 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = 'left';
    node.sourcePosition = 'right';
    node.position = {
      x: nodeWithPosition.x - 90,
      y: nodeWithPosition.y - 35,
    };
  });
  
  // Tính toán System Boundary bao quanh các Use Case
  const ucNodes = nodes.filter(n => n.type === 'useCaseNode');
  if (ucNodes.length > 0) {
     const minX = Math.min(...ucNodes.map(n => n.position.x)) - 60;
     const minY = Math.min(...ucNodes.map(n => n.position.y)) - 80; 
     const maxX = Math.max(...ucNodes.map(n => n.position.x + 180)) + 60;
     const maxY = Math.max(...ucNodes.map(n => n.position.y + 70)) + 60;
     
     const isDarkMode = nodes[0]?.data?.isDarkMode;
     
     nodes.unshift({
        id: 'system_boundary',
        type: 'systemBoundary',
        position: { x: minX, y: minY },
        style: { width: maxX - minX, height: maxY - minY, zIndex: -10 },
        data: { label: 'System', isDarkMode },
        draggable: false,
        selectable: false
     });
  }

  return { nodes, edges };
};

// --- Main App Component ---
export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [userStory, setUserStory] = useState("");
  const [language, setLanguage] = useState("Vietnamese");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [models, setModels] = useState<string[]>([]);
  const [modelName, setModelName] = useState("");
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Fetch available models on load
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const url = apiKey ? `${baseUrl}/api/models?api_key=${apiKey}` : `${baseUrl}/api/models`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setModels(data.models);
            setModelName(data.models[0]);
          }
        }
      } catch (err) {
        console.error("Lỗi fetch models", err);
      }
    };
    fetchModels();
  }, [apiKey]);

  // Cập nhật Dark Mode cho các Node đang có trên màn hình
  useEffect(() => {
    setNodes((nds) => nds.map((node) => ({ ...node, data: { ...node.data, isDarkMode } })));
  }, [isDarkMode, setNodes]);

  const handleGenerate = async () => {
    if (!userStory) return alert("Vui lòng nhập User Story!");
    setLoading(true);
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          api_key: apiKey || null, 
          user_story: userStory, 
          language: language,
          model_name: modelName
        })
      });
      
      if (!res.ok) {
         const err = await res.json();
         throw new Error(err.detail || "Có lỗi xảy ra từ máy chủ");
      }
      
      const data = await res.json();
      
      const newNodes: any[] = [];
      const newEdges: any[] = [];
      
      data.primary_actors.forEach((actor: string, i: number) => {
         newNodes.push({ id: `p_actor_${i}`, type: 'actorNode', data: { label: actor, isDarkMode }, position: { x: 0, y: 0 } });
      });
      
      data.secondary_actors.forEach((actor: string, i: number) => {
         newNodes.push({ id: `s_actor_${i}`, type: 'actorNode', data: { label: actor, isDarkMode }, position: { x: 0, y: 0 } });
      });
      
      data.use_cases.forEach((uc: any) => {
         newNodes.push({ id: uc.id, type: 'useCaseNode', data: { label: uc.name, isDarkMode }, position: { x: 0, y: 0 } });
      });
      
      const getActorNodeId = (name: string) => {
         let idx = data.primary_actors.findIndex((a: string) => a.toLowerCase() === name.toLowerCase());
         if (idx >= 0) return `p_actor_${idx}`;
         idx = data.secondary_actors.findIndex((a: string) => a.toLowerCase() === name.toLowerCase());
         if (idx >= 0) return `s_actor_${idx}`;
         return name;
      };
      
      data.relationships.forEach((rel: any, index: number) => {
         let source = getActorNodeId(rel.source);
         let target = getActorNodeId(rel.target);
         const isSecondary = data.secondary_actors.some((a: string) => a.toLowerCase() === rel.source.toLowerCase());
         
         let edge: any = {
           id: `e${index}`,
           source: source,
           target: target,
           type: 'smoothstep', 
         };
         
         if (rel.type === "include" || rel.type === "extend") {
            edge.animated = true;
            edge.label = `<<${rel.type}>>`;
            edge.labelStyle = { fill: '#ca8a04', fontWeight: 700, fontSize: 11 };
            edge.labelBgStyle = { fill: isDarkMode ? '#1e293b' : 'white', fillOpacity: 0.9 };
            edge.style = { stroke: '#eab308', strokeWidth: 2, strokeDasharray: '5 5' };
            edge.markerEnd = { type: MarkerType.ArrowClosed, color: '#eab308' };
         } else if (rel.type === "generalization") {
            edge.label = language === "Vietnamese" ? "kế thừa" : (language === "English" ? "extends" : "generalization");
            edge.labelStyle = { fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10 };
            edge.style = { stroke: isDarkMode ? '#94a3b8' : '#64748b', strokeWidth: 2 };
            edge.markerEnd = { type: MarkerType.ArrowClosed, color: isDarkMode ? '#94a3b8' : '#64748b' };
         } else {
            if (isSecondary) {
               edge.source = target;
               edge.target = source;
            }
            edge.style = { stroke: isDarkMode ? '#60a5fa' : '#3b82f6', strokeWidth: 2 };
         }
         newEdges.push(edge);
      });
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      
    } catch (err: any) {
      alert("Lỗi: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex h-screen w-full font-sans text-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
      {/* Sidebar Trái */}
      <div className={`w-[380px] h-full border-r shadow-xl flex flex-col p-6 z-10 relative transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>AI Use Case<br/>Architect <span className="text-sm font-normal text-gray-500">PRO</span></h1>
            <p className="text-gray-500 mt-1 text-xs">Biên dịch yêu cầu nghiệp vụ thành Interactive Canvas thông minh.</p>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className={`p-2 rounded-full border transition-colors ${isDarkMode ? 'bg-slate-700 border-slate-600 text-yellow-400 hover:bg-slate-600' : 'bg-gray-100 border-gray-200 text-slate-800 hover:bg-gray-200'}`}
            title="Đổi giao diện Sáng/Tối"
          >
            {isDarkMode ? '🌙' : '☀️'}
          </button>
        </div>
        
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">🔑 API Key (Tùy chọn)</label>
          <input 
            type="password" 
            className={`w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300'}`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Để trống nếu đã cài trong file .env"
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">🤖 Chọn Model AI</label>
            <select 
              className={`w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            >
              {models.length > 0 ? models.map(m => (
                <option key={m} value={m}>{m}</option>
              )) : (
                <option value="">Đang tải...</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">🌐 Ngôn Ngữ</label>
            <select 
              className={`w-full border p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="Vietnamese">Tiếng Việt</option>
              <option value="English">English</option>
              <option value="Japanese">日本語 (Japanese)</option>
              <option value="Korean">한국어 (Korean)</option>
            </select>
          </div>
        </div>
        
        <div className="mb-4 flex-grow flex flex-col">
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">📝 Yêu Cầu Nghiệp Vụ (User Story)</label>
          <textarea 
            className={`w-full border p-3 rounded-lg flex-grow focus:ring-2 focus:ring-blue-500 outline-none resize-none transition ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300'}`}
            value={userStory}
            onChange={(e) => setUserStory(e.target.value)}
            placeholder="Là một khách hàng, tôi muốn xem danh sách sản phẩm.
Là một khách hàng, tôi muốn thêm vào giỏ hàng (include đăng nhập)..."
          />
        </div>
        
        <button 
          onClick={handleGenerate}
          disabled={loading}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
        >
          {loading ? (
             <>
               <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               Đang phân tích AI...
             </>
          ) : "✨ Phân Tích & Render Canvas"}
        </button>
      </div>
      
      {/* Canvas Phải */}
      <div className="flex-grow h-full relative">
        {nodes.length === 0 && !loading && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 z-10 pointer-events-none">
             <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
             <p className={`font-medium text-lg ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Interactive Canvas Trống</p>
             <p className="text-sm">Nhập dữ liệu bên trái để AI tự động vẽ thiết kế hệ thống.</p>
           </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          colorMode={isDarkMode ? 'dark' : 'light'}
          className={isDarkMode ? 'bg-[#0f172a]' : 'bg-[#f8fafc]'}
          minZoom={0.2}
          maxZoom={4}
        >
          <Background color={isDarkMode ? '#334155' : '#cbd5e1'} gap={20} size={1} />
          <Controls className={`${isDarkMode ? 'bg-slate-800 border-slate-700 fill-white' : 'bg-white border-gray-200'} shadow-md rounded-md overflow-hidden`} />
          <MiniMap 
            nodeStrokeWidth={3} 
            nodeColor={(n) => n.type === 'actorNode' ? (isDarkMode ? '#60a5fa' : '#3b82f6') : (isDarkMode ? '#ca8a04' : '#eab308')}
            maskColor={isDarkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(248, 250, 252, 0.7)"}
            className={`rounded-lg shadow-md ${isDarkMode ? 'bg-slate-800' : 'bg-white'} border-none`}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

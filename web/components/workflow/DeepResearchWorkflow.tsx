"use client";

import React, { useState, useCallback, useEffect } from "react";

// ==== 类型定义 ==== //
interface Position {
    x: number;
    y: number;
}

interface NodeData {
    title: string;
    desc?: string;
    status?: "thinking" | "fully" | "control" | "partial" | "unsolved" | string;
    tag?: string;
}

interface NodeType {
    id: string;
    position: Position;
    data: NodeData;
}

interface EdgeType {
    id: string;
    source: string;
    target: string;
    label?: string;
}

interface WorkflowState {
    sessionId: string | null;
    currentQuestion: string | null;
    references: string[];
    // 添加研究报告内容状态
    reportContent: string | null;
}

interface DragState {
    isDragging: boolean;
    offset: Position;
}

interface NodeComponentProps {
    node: NodeType;
    onDrag?: (id: string, newPosition: Position) => void;
}

interface EdgeComponentProps {
    edge: EdgeType;
    nodes: NodeType[];
}

// ==== 主组件 ==== //
const DeepResearchWorkflow: React.FC = () => {
    const [messages, setMessages] = useState<string[]>([]);
    const [nodes, setNodes] = useState<NodeType[]>([]);
    const [edges, setEdges] = useState<EdgeType[]>([]);
    const [workflowState, setWorkflowState] = useState<WorkflowState>({
        sessionId: null,
        currentQuestion: null,
        references: [],
        reportContent: null,
    });
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        offset: { x: 0, y: 0 },
    });

    // 处理单条 SSE 数据
    const processSSEData = useCallback((line: string) => {
        try {
            const jsonStr = line.substring(5).trim(); // 去掉 "data:"
            if (jsonStr === '{"type":"heartbeat"}') return;

            const parsed = JSON.parse(jsonStr);

            switch (parsed.type) {
                case 'session-created': {
                    setWorkflowState(prev => ({ ...prev, sessionId: parsed.data.id }));
                    const rootNode = {
                        id: 'start',
                        position: { x: 250, y: 50 },
                        data: {
                            title: parsed.data.question || '未知问题',
                            status: 'control',
                            tag: 'ROOT'
                        },
                    };
                    setNodes([rootNode]);
                    // 添加初始消息
                    setMessages(prev => [...prev, `研究开始: ${parsed.data.question || '未知问题'}`]);
                    break;
                }
                case 'question-connection': {
                    const { child, parent, relation } = parsed.data;
                    setNodes(prev => {
                        if (prev.some(n => n.id === child.id)) return prev; // 避免重复
                        const newNode = {
                            id: child.id,
                            position: { x: 100 + Math.random() * 400, y: 150 + prev.length * 100 },
                            data: {
                                title: child.title,
                                desc: child.desc,
                                status: child.status || 'thinking',
                                tag: child.tag,
                            },
                        };
                        return [...prev, newNode];
                    });
                    setEdges(prev => [
                        ...prev,
                        {
                            id: `edge-${parent.id}-${child.id}`,
                            source: parent.id,
                            target: child.id,
                            label: relation || '',
                        },
                    ]);
                    break;
                }
                case 'question-connection-update': {
                    const { child } = parsed.data;
                    setNodes(prev =>
                        prev.map(node =>
                            node.id === child.id
                                ? {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        title: child.title,
                                        desc: child.desc,
                                        status: child.status,
                                        tag: child.tag,
                                    },
                                }
                                : node
                        )
                    );
                    break;
                }
                case 'question-start': {
                    setWorkflowState(prev => ({ ...prev, currentQuestion: parsed.question }));
                    // 添加消息到调试面板
                    setMessages(prev => [...prev, `开始研究问题: ${parsed.question}`]);
                    break;
                }
                case 'set-deep-think-reference': {
                    setWorkflowState(prev => ({ ...prev, references: parsed.list || [] }));
                    // 添加消息到调试面板
                    setMessages(prev => [...prev, `更新参考资料列表 (${parsed.list?.length || 0} 项)`]);
                    break;
                }
                // 添加处理研究报告生成完成的事件
                case 'deep-think-step-end': {
                    // 当研究报告生成完成后，可以在这里更新状态或添加特殊节点
                    setWorkflowState(prev => ({ ...prev, reportContent: parsed.result || '研究报告已生成' }));
                    // 将最后一个节点标记为已完成
                    setNodes(prev => 
                        prev.map(node => 
                            node.id === (prev[prev.length - 1]?.id || '') 
                                ? { ...node, data: { ...node.data, status: 'fully' } } 
                                : node
                        )
                    );
                    // 添加消息到调试面板
                    setMessages(prev => [...prev, `研究报告生成完成`]);
                    break;
                }
            }
        } catch (e) {
            console.warn("解析失败:", line, e);
        }
    }, []);


    // 模拟从文件加载 event.txt
    useEffect(() => {
        let interval: NodeJS.Timeout;
        fetch("/event.txt")
            .then((res) => res.text())
            .then((fileData) => {
                const lines = fileData
                    .split("\n")
                    .map((l) => l.trim())
                    .filter((l) => l.startsWith("data:"));

                let index = 0;
                interval = setInterval(() => {
                    if (index < lines.length) {
                        processSSEData(lines[index]);
                        index++;
                    } else {
                        clearInterval(interval);
                    }
                }, 1000);
            });

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [processSSEData]);

    // ==== 节点组件 ==== //
    const NodeComponent: React.FC<NodeComponentProps> = ({ node, onDrag }) => {
        const [isDragging, setIsDragging] = useState(false);
        const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
        const [isHovered, setIsHovered] = useState(false);

        const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            setIsDragging(true);
            const rect = e.currentTarget.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && onDrag) {
                onDrag(node.id, {
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y,
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        useEffect(() => {
            if (isDragging) {
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
                return () => {
                    document.removeEventListener("mousemove", handleMouseMove);
                    document.removeEventListener("mouseup", handleMouseUp);
                };
            }
        }, [isDragging, dragOffset]);

        const getNodeStyle = () => {
            const baseStyle =
                "absolute p-4 rounded-lg border-2 min-w-48 max-w-64 cursor-move shadow-lg transition-all duration-200 ";
            const hoverStyle = isHovered ? "ring-2 ring-opacity-50 " : "";
            switch (node.data.status) {
                case "thinking":
                    return baseStyle + hoverStyle + "border-blue-400 bg-blue-50 hover:shadow-xl ring-blue-300";
                case "fully":
                    return baseStyle + hoverStyle + "border-green-400 bg-green-50 hover:shadow-xl ring-green-300";
                case "control":
                    return baseStyle + hoverStyle + "border-purple-400 bg-purple-50 hover:shadow-xl ring-purple-300";
                case "partial":
                    return baseStyle + hoverStyle + "border-yellow-400 bg-yellow-50 hover:shadow-xl ring-yellow-300";
                case "unsolved":
                    return baseStyle + hoverStyle + "border-red-400 bg-red-50 hover:shadow-xl ring-red-300";
                default:
                    return baseStyle + hoverStyle + "border-gray-400 bg-gray-50 hover:shadow-xl ring-gray-300";
            }
        };

        const getStatusIcon = () => {
            switch (node.data.status) {
                case "thinking":
                    return "🤔";
                case "fully":
                    return "✅";
                case "control":
                    return "🎯";
                case "partial":
                    return "🚧";
                case "unsolved":
                    return "❌";
                default:
                    return "⚪";
            }
        };

        const getStatusText = () => {
            switch (node.data.status) {
                case "thinking":
                    return "思考中";
                case "fully":
                    return "已完成";
                case "control":
                    return "主节点";
                case "partial":
                    return "部分完成";
                case "unsolved":
                    return "未解决";
                default:
                    return node.data.status || "未知";
            }
        };

        return (
            <div
                className={getNodeStyle()}
                style={{
                    left: `${node.position.x}px`,
                    top: `${node.position.y}px`,
                    zIndex: isDragging ? 1000 : (isHovered ? 100 : 1),
                }}
                onMouseDown={handleMouseDown}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className="font-semibold text-sm mb-2 leading-tight">
                    {node.data.title}
                </div>
                {node.data.desc && (
                    <div className="text-xs text-gray-600 mb-3 leading-relaxed">
                        {node.data.desc}
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <div
                        className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${
                            node.data.status === "thinking"
                                ? "bg-blue-200 text-blue-800"
                                : node.data.status === "fully"
                                    ? "bg-green-200 text-green-800"
                                    : node.data.status === "control"
                                        ? "bg-purple-200 text-purple-800"
                                        : node.data.status === "partial"
                                            ? "bg-yellow-200 text-yellow-800"
                                            : node.data.status === "unsolved"
                                                ? "bg-red-200 text-red-800"
                                                : "bg-gray-200 text-gray-800"
                        }`}
                    >
                        <span>{getStatusIcon()}</span>
                        <span>{getStatusText()}</span>
                    </div>
                    {node.data.tag && (
                        <div className="text-xs text-gray-500 font-mono">#{node.data.tag}</div>
                    )}
                </div>
            </div>
        );
    };

    // ==== 边组件 ==== //
    const EdgeComponent: React.FC<EdgeComponentProps> = ({ edge, nodes }) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);

        if (!sourceNode || !targetNode) return null;

        const sourceX = sourceNode.position.x + 96;
        const sourceY = sourceNode.position.y + 40;
        const targetX = targetNode.position.x + 96;
        const targetY = targetNode.position.y + 40;

        const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
        const arrowLength = 8;
        const arrowX = targetX - arrowLength * Math.cos(angle);
        const arrowY = targetY - arrowLength * Math.sin(angle);

        // 根据边的标签或节点状态确定边的颜色
        const getEdgeColor = () => {
            if (edge.label) {
                switch (edge.label) {
                    case "数据处理":
                        return "#3b82f6"; // 蓝色
                    case "Web开发":
                        return "#10b981"; // 绿色
                    case "自动化":
                        return "#8b5cf6"; // 紫色
                    case "学习路径":
                        return "#f59e0b"; // 黄色
                    case "项目实践":
                        return "#ef4444"; // 红色
                    case "目标导向":
                        return "#06b6d4"; // 青色
                    case "版本与资源":
                        return "#8b5cf6"; // 紫色
                    case "相关":
                        return "#6b7280"; // 灰色
                    case "包含":
                        return "#ec4899"; // 粉色
                    default:
                        return "#6b7280"; // 默认灰色
                }
            }
            return "#6b7280"; // 默认灰色
        };

        return (
            <g>
                <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={arrowX}
                    y2={arrowY}
                    stroke={getEdgeColor()}
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                />
                {edge.label && (
                    <text
                        x={(sourceX + targetX) / 2}
                        y={(sourceY + targetY) / 2 - 5}
                        textAnchor="middle"
                        className="text-xs fill-gray-600 font-medium"
                        style={{ fill: getEdgeColor() }}
                    >
                        {edge.label}
                    </text>
                )}
            </g>
        );
    };

    // ==== 节点拖拽处理 ==== //
    const handleNodeDrag = useCallback(
        (nodeId: string, newPosition: Position) => {
            setNodes((prev) =>
                prev.map((node) =>
                    node.id === nodeId ? { ...node, position: newPosition } : node
                )
            );
        },
        []
    );

    return (
        <div className="w-full h-screen bg-gradient-to-br from-gray-50 to-blue-50 overflow-hidden relative flex">
            {/* 工作流可视化区域 */}
            <div className="flex-1 relative">
                {/* 打印调试消息 */}
                <div className="absolute top-4 left-4 bg-white p-2 rounded shadow-md max-w-md text-xs z-10">
                    {messages.map((msg, idx) => (
                        <div key={idx} className="mb-1 break-words">
                            {msg}
                        </div>
                    ))}
                </div>

                {/* 渲染边 */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="10"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
                        </marker>
                    </defs>
                    {edges.map((edge) => (
                        <EdgeComponent key={edge.id} edge={edge} nodes={nodes} />
                    ))}
                </svg>

                {/* 渲染节点 */}
                {nodes.map((node) => (
                    <NodeComponent key={node.id} node={node} onDrag={handleNodeDrag} />
                ))}
            </div>

            {/* 研究报告内容展示区域 */}
            {workflowState.reportContent && (
                <div className="w-1/3 bg-white p-4 overflow-y-auto border-l border-gray-200">
                    <h2 className="text-xl font-bold mb-4">研究报告</h2>
                    <div className="prose max-w-none">
                        {workflowState.reportContent.split('\n').map((paragraph, index) => (
                            <p key={index} className="mb-2">{paragraph}</p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeepResearchWorkflow;
